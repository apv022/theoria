import { AIProviderError } from "../types";

export const OPENROUTER_AUTH_TRANSACTION_KEY =
  "theoria:openrouter:authorization";
export const OPENROUTER_AUTHORIZATION_TTL_MS = 10 * 60 * 1_000;

export interface OpenRouterAuthorizationTransaction {
  readonly state: string;
  readonly codeVerifier: string;
  readonly callbackUrl: string;
  readonly createdAt: number;
}

export interface OpenRouterAuthorization {
  readonly authorizationUrl: string;
  readonly transaction: OpenRouterAuthorizationTransaction;
}

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const randomValue = (cryptoProvider: Crypto): string => {
  const bytes = new Uint8Array(32);
  cryptoProvider.getRandomValues(bytes);
  return base64Url(bytes);
};

export async function createOpenRouterAuthorization(
  callbackUrl: string,
  options: {
    readonly crypto?: Crypto;
    readonly now?: number;
    readonly authorizationBaseUrl?: string;
  } = {},
): Promise<OpenRouterAuthorization> {
  const cryptoProvider = options.crypto ?? globalThis.crypto;
  const callback = new URL(callbackUrl);
  if (callback.username || callback.password || callback.hash)
    throw new AIProviderError(
      "request-failed",
      "The OpenRouter callback URL is invalid.",
    );
  const codeVerifier = randomValue(cryptoProvider);
  const state = randomValue(cryptoProvider);
  const digest = new Uint8Array(
    await cryptoProvider.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(codeVerifier),
    ),
  );
  callback.searchParams.set("state", state);
  const authorization = new URL(
    "/auth",
    options.authorizationBaseUrl ?? "https://openrouter.ai",
  );
  authorization.searchParams.set("callback_url", callback.toString());
  authorization.searchParams.set("code_challenge", base64Url(digest));
  authorization.searchParams.set("code_challenge_method", "S256");
  return {
    authorizationUrl: authorization.toString(),
    transaction: {
      state,
      codeVerifier,
      callbackUrl,
      createdAt: options.now ?? Date.now(),
    },
  };
}

export function storeOpenRouterAuthorization(
  storage: Storage,
  transaction: OpenRouterAuthorizationTransaction,
): void {
  storage.setItem(OPENROUTER_AUTH_TRANSACTION_KEY, JSON.stringify(transaction));
}

export function takeOpenRouterAuthorization(
  storage: Storage,
  callbackUrl: string,
  now = Date.now(),
): { readonly code: string; readonly codeVerifier: string } {
  const serialized = storage.getItem(OPENROUTER_AUTH_TRANSACTION_KEY);
  storage.removeItem(OPENROUTER_AUTH_TRANSACTION_KEY);
  const callback = new URL(callbackUrl);
  let transaction: OpenRouterAuthorizationTransaction | undefined;
  try {
    transaction = serialized
      ? (JSON.parse(serialized) as OpenRouterAuthorizationTransaction)
      : undefined;
  } catch {
    transaction = undefined;
  }
  if (
    !transaction ||
    typeof transaction.state !== "string" ||
    typeof transaction.codeVerifier !== "string" ||
    typeof transaction.callbackUrl !== "string" ||
    typeof transaction.createdAt !== "number" ||
    callback.searchParams.get("state") !== transaction.state
  )
    throw new AIProviderError(
      "authorization-state-mismatch",
      "OpenRouter connection could not be verified. Start the connection again.",
    );
  const expected = new URL(transaction.callbackUrl);
  if (
    callback.origin !== expected.origin ||
    callback.pathname !== expected.pathname ||
    now < transaction.createdAt ||
    now - transaction.createdAt > OPENROUTER_AUTHORIZATION_TTL_MS
  )
    throw new AIProviderError(
      "authorization-expired",
      "OpenRouter authorization expired. Start the connection again.",
    );
  const code = callback.searchParams.get("code");
  if (!code)
    throw new AIProviderError(
      "authorization-cancelled",
      "OpenRouter authorization was cancelled.",
    );
  return { code, codeVerifier: transaction.codeVerifier };
}

export async function exchangeOpenRouterAuthorization(
  code: string,
  codeVerifier: string,
  options: {
    readonly fetch?: typeof globalThis.fetch;
    readonly apiBaseUrl?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<string> {
  const request = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await request(
      `${(options.apiBaseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "")}/auth/keys`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          code_challenge_method: "S256",
        }),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new AIProviderError(
      "provider-unavailable",
      "OpenRouter could not be reached to finish connecting.",
    );
  }
  if (!response.ok)
    throw new AIProviderError(
      response.status === 400 || response.status === 403
        ? "authorization-expired"
        : "request-failed",
      response.status === 400 || response.status === 403
        ? "OpenRouter authorization expired or was rejected. Start again."
        : "OpenRouter could not finish the connection.",
      response.status,
    );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AIProviderError(
      "invalid-response",
      "OpenRouter returned an invalid connection response.",
    );
  }
  const key =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).key
      : undefined;
  if (typeof key !== "string" || !key)
    throw new AIProviderError(
      "invalid-response",
      "OpenRouter returned an invalid connection response.",
    );
  return key;
}
