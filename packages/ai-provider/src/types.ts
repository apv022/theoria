export type ProviderId = string & { readonly __brand: "ProviderId" };

export const providerId = (value: string): ProviderId => value as ProviderId;

export interface ModelDescriptor {
  readonly id: string;
  readonly providerId: ProviderId;
  readonly name: string;
  readonly description?: string;
  readonly contextWindow?: number;
}

export interface GenerationMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface GenerationRequest {
  readonly modelId: string;
  readonly messages: readonly GenerationMessage[];
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly signal?: AbortSignal;
}

export interface GenerationUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly cost?: {
    readonly amount: number;
    readonly unit: "provider-credits" | "USD";
  };
}

export interface GenerationResult {
  readonly text: string;
  readonly modelId: string;
  readonly finishReason:
    | "stop"
    | "length"
    | "content-filter"
    | "tool-call"
    | "unknown";
  readonly usage?: GenerationUsage;
}

export interface AIProvider {
  readonly id: ProviderId;
  readonly name: string;
  connectionStatus(): Promise<ProviderConnectionState>;
  listModels(options?: {
    readonly signal?: AbortSignal;
  }): Promise<readonly ModelDescriptor[]>;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export interface ProviderCredential {
  readonly providerId: ProviderId;
  readonly secret: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly selectedModelId?: string;
}

export interface ProviderCredentialStore {
  get(provider: ProviderId): Promise<ProviderCredential | undefined>;
  put(credential: ProviderCredential): Promise<void>;
  remove(provider: ProviderId): Promise<void>;
  selectedModel(provider: ProviderId): Promise<string | undefined>;
  selectModel(provider: ProviderId, modelId: string): Promise<void>;
}

export type ProviderConnectionIssue =
  | "credential-missing"
  | "credential-rejected"
  | "provider-unavailable";

export type ProviderConnectionState =
  | {
      readonly status: "disconnected";
      readonly providerId: ProviderId;
    }
  | {
      readonly status: "connecting";
      readonly providerId: ProviderId;
    }
  | {
      readonly status: "connected";
      readonly providerId: ProviderId;
      readonly connectedAt: string;
      readonly account?: ProviderAccountSummary;
    }
  | {
      readonly status: "unavailable";
      readonly providerId: ProviderId;
      readonly issue: ProviderConnectionIssue;
    };

export interface ProviderAccountSummary {
  readonly label?: string;
  readonly expiresAt?: string;
  readonly spendLimit?: number;
  readonly spendRemaining?: number;
  readonly spendLimitReset?: "daily" | "weekly" | "monthly" | "unknown";
  readonly spendUnit: "provider-credits";
}

export type AIProviderErrorCode =
  | ProviderConnectionIssue
  | "authorization-cancelled"
  | "authorization-expired"
  | "authorization-state-mismatch"
  | "insufficient-credits"
  | "invalid-response"
  | "model-unavailable"
  | "permission-denied"
  | "rate-limited"
  | "request-failed";

/** A deliberately redacted provider failure: credentials and response bodies are never retained. */
export class AIProviderError extends Error {
  override readonly name = "AIProviderError";

  constructor(
    readonly code: AIProviderErrorCode,
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
