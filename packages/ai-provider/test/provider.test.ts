import assert from "node:assert/strict";
import test from "node:test";
import {
  AIProviderError,
  OPENROUTER_PROVIDER_ID,
  createOpenRouterProvider,
  providerId,
  type AIProvider,
  type ProviderCredential,
  type ProviderCredentialStore,
} from "../src/index";

const fakeSecret = "sk-or-v1-fake-provider-test";

class MemoryCredentialStore implements ProviderCredentialStore {
  credential: ProviderCredential | undefined;

  async get() {
    return this.credential;
  }

  async put(credential: ProviderCredential) {
    this.credential = credential;
  }

  async remove() {
    this.credential = undefined;
  }

  async selectedModel() {
    return this.credential?.selectedModelId;
  }

  async selectModel(
    _provider: ProviderCredential["providerId"],
    modelId: string,
  ) {
    if (!this.credential) throw new Error("Credential missing");
    this.credential = { ...this.credential, selectedModelId: modelId };
  }
}

const connectedCredentials = (): MemoryCredentialStore => {
  const credentials = new MemoryCredentialStore();
  credentials.credential = {
    providerId: OPENROUTER_PROVIDER_ID,
    secret: fakeSecret,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  return credentials;
};

test("the provider contract is implementable without OpenRouter payload types", async () => {
  const id = providerId("test-provider");
  const provider: AIProvider = {
    id,
    name: "Test provider",
    async connectionStatus() {
      return { status: "disconnected", providerId: id };
    },
    async listModels() {
      return [{ id: "small", providerId: id, name: "Small" }];
    },
    async generate(request) {
      return {
        text: request.messages.map((message) => message.content).join(" "),
        modelId: request.modelId,
        finishReason: "stop",
      };
    },
  };

  assert.equal((await provider.listModels())[0]?.name, "Small");
  assert.equal(
    (
      await provider.generate({
        modelId: "small",
        messages: [{ role: "user", content: "Draft an outline." }],
      })
    ).text,
    "Draft an outline.",
  );
});

test("OpenRouter uses a credential only in the authorization header", async () => {
  const requests: Request[] = [];
  const request: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return Response.json({
      data: [
        {
          id: "example/model",
          name: "Example model",
          description: "For tests",
          context_length: 8192,
          pricing: { prompt: "provider-specific and ignored" },
        },
      ],
    });
  };
  const provider = createOpenRouterProvider({
    credentials: connectedCredentials(),
    fetch: request,
  });

  assert.deepEqual(await provider.listModels(), [
    {
      id: "example/model",
      providerId: OPENROUTER_PROVIDER_ID,
      name: "Example model",
      description: "For tests",
      contextWindow: 8192,
    },
  ]);
  const sent = requests[0];
  assert.ok(sent);
  assert.equal(sent.url, "https://openrouter.ai/api/v1/models");
  assert.equal(sent.headers.get("Authorization"), `Bearer ${fakeSecret}`);
  assert.ok(!sent.url.includes(fakeSecret));
  assert.ok(!(await sent.text()).includes(fakeSecret));
});

test("OpenRouter maps generation output and direct provider usage", async () => {
  let sent: Request | undefined;
  const request: typeof fetch = async (input, init) => {
    sent = new Request(input, init);
    return Response.json({
      model: "example/model",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "Generated draft" },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
        cost: 0.002,
      },
    });
  };
  const provider = createOpenRouterProvider({
    credentials: connectedCredentials(),
    fetch: request,
  });

  const result = await provider.generate({
    modelId: "example/model",
    messages: [{ role: "user", content: "Create a draft." }],
    maxOutputTokens: 200,
  });

  assert.deepEqual(result, {
    text: "Generated draft",
    modelId: "example/model",
    finishReason: "stop",
    usage: {
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      cost: { amount: 0.002, unit: "provider-credits" },
    },
  });
  assert.equal(sent?.url, "https://openrouter.ai/api/v1/chat/completions");
  const body = await sent?.json();
  assert.deepEqual(body, {
    model: "example/model",
    messages: [{ role: "user", content: "Create a draft." }],
    stream: false,
    max_tokens: 200,
  });
  assert.ok(!JSON.stringify(body).includes(fakeSecret));
});

test("OpenRouter failures never retain a credential or response body", async () => {
  const provider = createOpenRouterProvider({
    credentials: connectedCredentials(),
    fetch: async () =>
      new Response(
        JSON.stringify({ error: { message: `Rejected ${fakeSecret}` } }),
        { status: 401 },
      ),
  });

  await assert.rejects(provider.listModels(), (error: unknown) => {
    assert.ok(error instanceof AIProviderError);
    assert.equal(error.code, "credential-rejected");
    assert.equal(error.status, 401);
    assert.ok(!JSON.stringify(error).includes(fakeSecret));
    assert.ok(!error.message.includes(fakeSecret));
    return true;
  });
});

test("OpenRouter does not issue a request without a local credential", async () => {
  let called = false;
  const provider = createOpenRouterProvider({
    credentials: new MemoryCredentialStore(),
    fetch: async () => {
      called = true;
      return Response.json({ data: [] });
    },
  });

  await assert.rejects(provider.listModels(), {
    name: "AIProviderError",
    code: "credential-missing",
  });
  assert.equal(called, false);
});

test("OpenRouter reports connection metadata without exposing the credential", async () => {
  const provider = createOpenRouterProvider({
    credentials: connectedCredentials(),
    fetch: async () =>
      Response.json({
        data: {
          label: "Theoria device",
          expires_at: "2027-01-01T00:00:00Z",
          limit: 20,
          limit_remaining: 12.5,
          limit_reset: "monthly",
        },
      }),
  });

  const status = await provider.connectionStatus();
  assert.deepEqual(status, {
    status: "connected",
    providerId: OPENROUTER_PROVIDER_ID,
    connectedAt: "2026-08-14T00:00:00.000Z",
    account: {
      label: "Theoria device",
      expiresAt: "2027-01-01T00:00:00Z",
      spendLimit: 20,
      spendRemaining: 12.5,
      spendLimitReset: "monthly",
      spendUnit: "provider-credits",
    },
  });
  assert.ok(!JSON.stringify(status).includes(fakeSecret));
});

for (const failure of [
  {
    name: "revoked credentials",
    status: 401,
    errorType: "authentication",
    code: "credential-rejected",
  },
  {
    name: "provider payment failures",
    status: 402,
    errorType: "payment_required",
    code: "insufficient-credits",
  },
  {
    name: "rate limits",
    status: 429,
    errorType: "rate_limit_exceeded",
    code: "rate-limited",
  },
  {
    name: "removed models",
    status: 404,
    errorType: "not_found",
    code: "model-unavailable",
  },
] as const) {
  test(`OpenRouter normalizes ${failure.name}`, async () => {
    const provider = createOpenRouterProvider({
      credentials: connectedCredentials(),
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: `unsafe ${fakeSecret}`,
              metadata: { error_type: failure.errorType },
            },
          }),
          {
            status: failure.status,
            headers: failure.status === 429 ? { "Retry-After": "17" } : {},
          },
        ),
    });

    await assert.rejects(provider.listModels(), (error: unknown) => {
      assert.ok(error instanceof AIProviderError);
      assert.equal(error.code, failure.code);
      if (failure.status === 429) assert.equal(error.retryAfterSeconds, 17);
      assert.ok(!JSON.stringify(error).includes(fakeSecret));
      return true;
    });
  });
}

test("OpenRouter rejects malformed model and generation responses", async () => {
  const responses = [
    Response.json({ models: [] }),
    Response.json({ choices: [] }),
  ];
  const provider = createOpenRouterProvider({
    credentials: connectedCredentials(),
    fetch: async () => responses.shift()!,
  });

  await assert.rejects(provider.listModels(), {
    name: "AIProviderError",
    code: "invalid-response",
  });
  await assert.rejects(
    provider.generate({
      modelId: "missing/model",
      messages: [{ role: "user", content: "Draft" }],
    }),
    { name: "AIProviderError", code: "invalid-response" },
  );
});
