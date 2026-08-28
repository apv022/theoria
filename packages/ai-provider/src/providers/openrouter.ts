import {
  AIProviderError,
  providerId,
  type AIProvider,
  type GenerationRequest,
  type GenerationResult,
  type GenerationUsage,
  type ModelDescriptor,
  type ProviderAccountSummary,
  type ProviderCredentialStore,
  type ProviderConnectionState,
} from "../types";

export const OPENROUTER_PROVIDER_ID = providerId("openrouter");

const defaultBaseUrl = "https://openrouter.ai/api/v1";

type OpenRouterProviderOptions = {
  readonly credentials: ProviderCredentialStore;
  readonly fetch?: typeof globalThis.fetch;
  readonly baseUrl?: string;
};

type OpenRouterModel = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly description?: unknown;
  readonly context_length?: unknown;
};

type OpenRouterModelsResponse = {
  readonly data?: unknown;
};

type OpenRouterCompletionResponse = {
  readonly model?: unknown;
  readonly choices?: unknown;
  readonly usage?: unknown;
  readonly error?: unknown;
};

type OpenRouterKeyResponse = {
  readonly data?: unknown;
};

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const finishReason = (value: unknown): GenerationResult["finishReason"] => {
  if (value === "stop") return "stop";
  if (value === "length") return "length";
  if (value === "content_filter") return "content-filter";
  if (value === "tool_calls" || value === "function_call") return "tool-call";
  return "unknown";
};

const usageFrom = (value: unknown): GenerationUsage | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const inputTokens = finiteNumber(record.prompt_tokens);
  const outputTokens = finiteNumber(record.completion_tokens);
  const totalTokens = finiteNumber(record.total_tokens);
  const costAmount = finiteNumber(record.cost);
  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    costAmount === undefined
  )
    return undefined;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(costAmount === undefined
      ? {}
      : {
          cost: {
            amount: costAmount,
            unit: "provider-credits" as const,
          },
        }),
  };
};

const errorTypeFrom = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const outer = value as Record<string, unknown>;
  const error = outer.error;
  if (!error || typeof error !== "object") return undefined;
  const errorRecord = error as Record<string, unknown>;
  const metadata = errorRecord.metadata;
  if (
    metadata &&
    typeof metadata === "object" &&
    typeof (metadata as Record<string, unknown>).error_type === "string"
  )
    return (metadata as Record<string, unknown>).error_type as string;
  return typeof errorRecord.error_type === "string"
    ? errorRecord.error_type
    : undefined;
};

const normalizedFailure = (
  status: number,
  errorType?: string,
  retryAfterSeconds?: number,
): AIProviderError => {
  if (status === 401 || errorType === "authentication")
    return new AIProviderError(
      "credential-rejected",
      "OpenRouter rejected this credential. Reconnect or enter a valid API key.",
      status,
    );
  if (status === 402 || errorType === "payment_required")
    return new AIProviderError(
      "insufficient-credits",
      "This OpenRouter account or key has insufficient credits.",
      status,
    );
  if (status === 429 || errorType === "rate_limit_exceeded")
    return new AIProviderError(
      "rate-limited",
      retryAfterSeconds
        ? `OpenRouter is rate limiting requests. Try again in ${retryAfterSeconds} seconds.`
        : "OpenRouter is rate limiting requests. Try again shortly.",
      status,
      retryAfterSeconds,
    );
  if (status === 404 || errorType === "not_found")
    return new AIProviderError(
      "model-unavailable",
      "The selected OpenRouter model is no longer available.",
      status,
    );
  if (status === 403 || errorType === "permission_denied")
    return new AIProviderError(
      "permission-denied",
      "This OpenRouter key does not permit that request.",
      status,
    );
  if (
    status === 502 ||
    status === 503 ||
    errorType === "provider_overloaded" ||
    errorType === "provider_unavailable" ||
    errorType === "timeout"
  )
    return new AIProviderError(
      "provider-unavailable",
      "OpenRouter or the selected model is temporarily unavailable.",
      status,
    );
  return new AIProviderError(
    "request-failed",
    "OpenRouter could not complete the request.",
    status,
  );
};

const retryAfter = (response: Response): number | undefined => {
  const value = Number(response.headers.get("Retry-After"));
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const connectionIssueFrom = (
  error: AIProviderError,
): Extract<ProviderConnectionState, { status: "unavailable" }>["issue"] =>
  error.code === "credential-missing"
    ? "credential-missing"
    : error.code === "credential-rejected"
      ? "credential-rejected"
      : "provider-unavailable";

const accountSummaryFrom = (value: unknown): ProviderAccountSummary => {
  if (!value || typeof value !== "object")
    throw new AIProviderError(
      "invalid-response",
      "OpenRouter returned invalid account information.",
    );
  const record = value as Record<string, unknown>;
  const reset = record.limit_reset;
  return {
    ...(typeof record.label === "string" ? { label: record.label } : {}),
    ...(typeof record.expires_at === "string"
      ? { expiresAt: record.expires_at }
      : {}),
    ...(finiteNumber(record.limit) === undefined
      ? {}
      : { spendLimit: finiteNumber(record.limit)! }),
    ...(finiteNumber(record.limit_remaining) === undefined
      ? {}
      : { spendRemaining: finiteNumber(record.limit_remaining)! }),
    ...(typeof reset === "string"
      ? {
          spendLimitReset:
            reset === "daily" || reset === "weekly" || reset === "monthly"
              ? reset
              : ("unknown" as const),
        }
      : {}),
    spendUnit: "provider-credits",
  };
};

export function createOpenRouterProvider({
  credentials,
  fetch: request = globalThis.fetch,
  baseUrl = defaultBaseUrl,
}: OpenRouterProviderOptions): AIProvider {
  const endpoint = baseUrl.replace(/\/$/, "");

  const authorizedRequest = async (
    path: string,
    init: Omit<RequestInit, "headers"> & {
      readonly headers?: Readonly<Record<string, string>>;
    } = {},
  ): Promise<Response> => {
    const credential = await credentials.get(OPENROUTER_PROVIDER_ID);
    if (!credential?.secret)
      throw new AIProviderError(
        "credential-missing",
        "Connect OpenRouter before using external compute.",
      );
    let response: Response;
    try {
      response = await request(`${endpoint}${path}`, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${credential.secret}`,
        },
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new AIProviderError(
        "provider-unavailable",
        "OpenRouter could not be reached.",
      );
    }
    if (!response.ok) {
      let payload: unknown;
      try {
        payload = await response.clone().json();
      } catch {
        payload = undefined;
      }
      throw normalizedFailure(
        response.status,
        errorTypeFrom(payload),
        retryAfter(response),
      );
    }
    return response;
  };

  return {
    id: OPENROUTER_PROVIDER_ID,
    name: "OpenRouter",
    async connectionStatus(): Promise<ProviderConnectionState> {
      const credential = await credentials.get(OPENROUTER_PROVIDER_ID);
      if (!credential)
        return { status: "disconnected", providerId: OPENROUTER_PROVIDER_ID };
      try {
        const response = await authorizedRequest("/key", { method: "GET" });
        const payload = (await response.json()) as OpenRouterKeyResponse;
        return {
          status: "connected",
          providerId: OPENROUTER_PROVIDER_ID,
          connectedAt: credential.createdAt,
          account: accountSummaryFrom(payload.data),
        };
      } catch (error) {
        if (error instanceof AIProviderError)
          return {
            status: "unavailable",
            providerId: OPENROUTER_PROVIDER_ID,
            issue: connectionIssueFrom(error),
          };
        throw error;
      }
    },
    async listModels(options = {}): Promise<readonly ModelDescriptor[]> {
      const response = await authorizedRequest("/models", {
        method: "GET",
        ...(options.signal ? { signal: options.signal } : {}),
      });
      let payload: OpenRouterModelsResponse;
      try {
        payload = (await response.json()) as OpenRouterModelsResponse;
      } catch {
        throw new AIProviderError(
          "invalid-response",
          "OpenRouter returned an invalid model list.",
        );
      }
      if (!Array.isArray(payload.data))
        throw new AIProviderError(
          "invalid-response",
          "OpenRouter returned an invalid model list.",
        );
      return payload.data.flatMap((value): ModelDescriptor[] => {
        if (!value || typeof value !== "object") return [];
        const model = value as OpenRouterModel;
        if (typeof model.id !== "string") return [];
        const contextWindow = finiteNumber(model.context_length);
        return [
          {
            id: model.id,
            providerId: OPENROUTER_PROVIDER_ID,
            name: typeof model.name === "string" ? model.name : model.id,
            ...(typeof model.description === "string"
              ? { description: model.description }
              : {}),
            ...(contextWindow === undefined ? {} : { contextWindow }),
          },
        ];
      });
    },
    async generate(requestValue: GenerationRequest): Promise<GenerationResult> {
      const response = await authorizedRequest("/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(requestValue.signal ? { signal: requestValue.signal } : {}),
        body: JSON.stringify({
          model: requestValue.modelId,
          messages: requestValue.messages,
          stream: false,
          ...(requestValue.temperature === undefined
            ? {}
            : { temperature: requestValue.temperature }),
          ...(requestValue.maxOutputTokens === undefined
            ? {}
            : { max_tokens: requestValue.maxOutputTokens }),
        }),
      });
      let payload: OpenRouterCompletionResponse;
      try {
        payload = (await response.json()) as OpenRouterCompletionResponse;
      } catch {
        throw new AIProviderError(
          "invalid-response",
          "OpenRouter returned an invalid generation response.",
        );
      }
      if (payload.error) throw normalizedFailure(500, errorTypeFrom(payload));
      if (!Array.isArray(payload.choices))
        throw new AIProviderError(
          "invalid-response",
          "OpenRouter returned an invalid generation response.",
        );
      const choice = payload.choices[0];
      if (!choice || typeof choice !== "object")
        throw new AIProviderError(
          "invalid-response",
          "OpenRouter returned no generated text.",
        );
      const record = choice as Record<string, unknown>;
      const message = record.message;
      const text =
        message && typeof message === "object"
          ? (message as Record<string, unknown>).content
          : undefined;
      if (typeof text !== "string")
        throw new AIProviderError(
          "invalid-response",
          "OpenRouter returned no generated text.",
        );
      const usage = usageFrom(payload.usage);
      return {
        text,
        modelId:
          typeof payload.model === "string"
            ? payload.model
            : requestValue.modelId,
        finishReason: finishReason(record.finish_reason),
        ...(usage ? { usage } : {}),
      };
    },
  };
}
