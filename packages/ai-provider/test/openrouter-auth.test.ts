import assert from "node:assert/strict";
import test from "node:test";
import {
  AIProviderError,
  OPENROUTER_AUTHORIZATION_TTL_MS,
  OPENROUTER_AUTH_TRANSACTION_KEY,
  createOpenRouterAuthorization,
  exchangeOpenRouterAuthorization,
  storeOpenRouterAuthorization,
  takeOpenRouterAuthorization,
} from "../src/index";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("OpenRouter connect creates a state-bound S256 PKCE authorization", async () => {
  const connection = await createOpenRouterAuthorization(
    "https://theoria.example/settings/ai-providers",
    { now: 1_000 },
  );
  const authorization = new URL(connection.authorizationUrl);
  const callback = new URL(authorization.searchParams.get("callback_url")!);

  assert.equal(authorization.origin, "https://openrouter.ai");
  assert.equal(authorization.pathname, "/auth");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.match(
    authorization.searchParams.get("code_challenge")!,
    /^[\w-]{43}$/,
  );
  assert.equal(callback.origin, "https://theoria.example");
  assert.equal(callback.pathname, "/settings/ai-providers");
  assert.equal(
    callback.searchParams.get("state"),
    connection.transaction.state,
  );
  assert.ok(
    !connection.authorizationUrl.includes(connection.transaction.codeVerifier),
  );
});

test("callback state is single-use and validates state, URL, and lifetime", async () => {
  const storage = new MemoryStorage();
  const connection = await createOpenRouterAuthorization(
    "https://theoria.example/settings/ai-providers",
    { now: 2_000 },
  );
  storeOpenRouterAuthorization(storage, connection.transaction);
  const callback = new URL(connection.transaction.callbackUrl);
  callback.searchParams.set("state", connection.transaction.state);
  callback.searchParams.set("code", "short-lived-code");

  assert.deepEqual(
    takeOpenRouterAuthorization(storage, callback.toString(), 2_001),
    {
      code: "short-lived-code",
      codeVerifier: connection.transaction.codeVerifier,
    },
  );
  assert.equal(storage.getItem(OPENROUTER_AUTH_TRANSACTION_KEY), null);
  assert.throws(
    () => takeOpenRouterAuthorization(storage, callback.toString()),
    {
      name: "AIProviderError",
      code: "authorization-state-mismatch",
    },
  );

  storeOpenRouterAuthorization(storage, connection.transaction);
  callback.searchParams.set("state", "attacker-state");
  assert.throws(
    () => takeOpenRouterAuthorization(storage, callback.toString()),
    {
      name: "AIProviderError",
      code: "authorization-state-mismatch",
    },
  );

  storeOpenRouterAuthorization(storage, connection.transaction);
  callback.searchParams.set("state", connection.transaction.state);
  assert.throws(
    () =>
      takeOpenRouterAuthorization(
        storage,
        callback.toString(),
        connection.transaction.createdAt + OPENROUTER_AUTHORIZATION_TTL_MS + 1,
      ),
    { name: "AIProviderError", code: "authorization-expired" },
  );
});

test("authorization cancellation removes ephemeral PKCE material", async () => {
  const storage = new MemoryStorage();
  const connection = await createOpenRouterAuthorization(
    "https://theoria.example/settings/ai-providers",
  );
  storeOpenRouterAuthorization(storage, connection.transaction);
  const callback = new URL(connection.transaction.callbackUrl);
  callback.searchParams.set("state", connection.transaction.state);
  callback.searchParams.set("error", "access_denied");

  assert.throws(
    () => takeOpenRouterAuthorization(storage, callback.toString()),
    {
      name: "AIProviderError",
      code: "authorization-cancelled",
    },
  );
  assert.equal(storage.getItem(OPENROUTER_AUTH_TRANSACTION_KEY), null);
});

test("authorization exchange sends PKCE material in JSON and returns only the key", async () => {
  let sent: Request | undefined;
  const secret = "sk-or-v1-fake-exchange-secret";
  const key = await exchangeOpenRouterAuthorization("code", "verifier", {
    fetch: async (input, init) => {
      sent = new Request(input, init);
      return Response.json({ key: secret });
    },
  });

  assert.equal(key, secret);
  assert.equal(sent?.url, "https://openrouter.ai/api/v1/auth/keys");
  assert.equal(sent?.headers.get("Authorization"), null);
  assert.deepEqual(await sent?.json(), {
    code: "code",
    code_verifier: "verifier",
    code_challenge_method: "S256",
  });
});

test("authorization exchange failures are safely redacted", async () => {
  const secret = "sk-or-v1-fake-error-secret";
  await assert.rejects(
    exchangeOpenRouterAuthorization("code", "verifier", {
      fetch: async () =>
        new Response(JSON.stringify({ error: `unsafe ${secret}` }), {
          status: 403,
        }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AIProviderError);
      assert.equal(error.code, "authorization-expired");
      assert.ok(!JSON.stringify(error).includes(secret));
      return true;
    },
  );
});
