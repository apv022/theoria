"use client";

import {
  AIProviderError,
  OPENROUTER_AUTH_TRANSACTION_KEY,
  OPENROUTER_PROVIDER_ID,
  createOpenRouterAuthorization,
  createOpenRouterProvider,
  exchangeOpenRouterAuthorization,
  storeOpenRouterAuthorization,
  takeOpenRouterAuthorization,
  type ModelDescriptor,
  type ProviderConnectionState,
} from "@theoria/ai-provider";
import { IndexedDbLocalStore } from "@theoria/local-store";
import { Button, Field, ProviderConnectionStatus } from "@theoria/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { openRouterCallbackUrl } from "../lib/provider-redirect";

const localStore =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

const disconnected = (): ProviderConnectionState => ({
  status: "disconnected",
  providerId: OPENROUTER_PROVIDER_ID,
});

const safeMessage = (reason: unknown): string =>
  reason instanceof AIProviderError
    ? reason.message
    : "OpenRouter could not complete that action.";

const issueMessage = (
  state: Extract<ProviderConnectionState, { status: "unavailable" }>,
): string =>
  state.issue === "credential-rejected"
    ? "The stored OpenRouter credential is invalid, expired, or revoked. Reconnect or disconnect it."
    : "OpenRouter could not be reached. Your local credential and the rest of Theoria are unchanged.";

export function AIProviderSettings() {
  const callbackHandled = useRef(false);
  const [connection, setConnection] =
    useState<ProviderConnectionState>(disconnected);
  const [models, setModels] = useState<readonly ModelDescriptor[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>();
  const [query, setQuery] = useState("");
  const [changingModel, setChangingModel] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const provider = useMemo(
    () =>
      localStore
        ? createOpenRouterProvider({ credentials: localStore.credentials })
        : undefined,
    [],
  );

  const refresh = useCallback(async () => {
    if (!localStore || !provider) {
      setError("IndexedDB is unavailable or blocked in this browser.");
      setBusy(false);
      return;
    }
    setError(undefined);
    const status = await provider.connectionStatus();
    setConnection(status);
    if (status.status !== "connected") {
      setModels([]);
      setSelectedModel(undefined);
      setBusy(false);
      return;
    }
    try {
      const available = [...(await provider.listModels())].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      setModels(available);
      const saved = await localStore.credentials.selectedModel(
        OPENROUTER_PROVIDER_ID,
      );
      const next = available.some((model) => model.id === saved)
        ? saved
        : available[0]?.id;
      if (next && next !== saved) {
        await localStore.credentials.selectModel(OPENROUTER_PROVIDER_ID, next);
        if (saved)
          setMessage(
            "The previously selected model is unavailable. A current OpenRouter model was selected instead.",
          );
      }
      setSelectedModel(next);
    } catch (reason) {
      setError(safeMessage(reason));
      setModels([]);
    } finally {
      setBusy(false);
    }
  }, [provider]);

  useEffect(() => {
    if (callbackHandled.current) return;
    callbackHandled.current = true;
    const callback = new URL(window.location.href);
    const isCallback =
      callback.searchParams.has("code") ||
      callback.searchParams.has("state") ||
      callback.searchParams.has("error");
    if (!isCallback) {
      sessionStorage.removeItem(OPENROUTER_AUTH_TRANSACTION_KEY);
      void refresh();
      return;
    }
    setBusy(true);
    setError(undefined);
    let authorization: { readonly code: string; readonly codeVerifier: string };
    try {
      authorization = takeOpenRouterAuthorization(
        sessionStorage,
        callback.toString(),
      );
    } catch (reason) {
      history.replaceState(null, "", "/settings/ai-providers");
      setError(safeMessage(reason));
      setBusy(false);
      return;
    }
    history.replaceState(null, "", "/settings/ai-providers");
    void exchangeOpenRouterAuthorization(
      authorization.code,
      authorization.codeVerifier,
    )
      .then(async (secret) => {
        if (!localStore)
          throw new AIProviderError(
            "request-failed",
            "IndexedDB is unavailable or blocked in this browser.",
          );
        const at = new Date().toISOString();
        await localStore.credentials.put({
          providerId: OPENROUTER_PROVIDER_ID,
          secret,
          createdAt: at,
          updatedAt: at,
        });
        setMessage("OpenRouter connected on this device.");
        await refresh();
      })
      .catch((reason) => {
        setError(safeMessage(reason));
        setBusy(false);
      });
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const authorization = await createOpenRouterAuthorization(
        openRouterCallbackUrl(location.origin),
      );
      storeOpenRouterAuthorization(sessionStorage, authorization.transaction);
      location.assign(authorization.authorizationUrl);
    } catch (reason) {
      setError(safeMessage(reason));
      setBusy(false);
    }
  };

  const saveManualKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!localStore || !provider) return;
    const form = event.currentTarget;
    const secret = String(new FormData(form).get("apiKey") ?? "").trim();
    form.reset();
    if (!secret) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const at = new Date().toISOString();
      await localStore.credentials.put({
        providerId: OPENROUTER_PROVIDER_ID,
        secret,
        createdAt: at,
        updatedAt: at,
      });
      const status = await provider.connectionStatus();
      if (status.status !== "connected") {
        await localStore.credentials.remove(OPENROUTER_PROVIDER_ID);
        setConnection(status);
        setError(
          status.status === "unavailable"
            ? issueMessage(status)
            : "OpenRouter could not validate that API key.",
        );
        setBusy(false);
        return;
      }
      setMessage("OpenRouter API key saved on this device.");
      await refresh();
    } catch (reason) {
      await localStore.credentials.remove(OPENROUTER_PROVIDER_ID);
      setError(safeMessage(reason));
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!localStore) return;
    setBusy(true);
    await localStore.credentials.remove(OPENROUTER_PROVIDER_ID);
    setConnection(disconnected());
    setModels([]);
    setSelectedModel(undefined);
    setChangingModel(false);
    setMessage("OpenRouter disconnected. The local credential was removed.");
    setError(undefined);
    setBusy(false);
  };

  const chooseModel = async (modelId: string) => {
    if (!localStore) return;
    await localStore.credentials.selectModel(OPENROUTER_PROVIDER_ID, modelId);
    setSelectedModel(modelId);
    setChangingModel(false);
    setMessage("OpenRouter model selection saved on this device.");
  };

  const filteredModels = models.filter((model) => {
    const term = query.trim().toLowerCase();
    return (
      !term ||
      model.name.toLowerCase().includes(term) ||
      model.id.toLowerCase().includes(term)
    );
  });
  const selectedDescriptor = models.find((model) => model.id === selectedModel);

  return (
    <section
      className="settings-card provider-settings"
      aria-labelledby="openrouter-heading"
    >
      <div className="settings-heading">
        <div>
          <p className="section-label">External compute</p>
          <h2 id="openrouter-heading">OpenRouter</h2>
        </div>
        <ProviderConnectionStatus
          state={connection}
          providerName="OpenRouter"
          {...(connection.status === "connected" ||
          connection.status === "unavailable"
            ? { onDisconnect: () => void disconnect() }
            : {})}
        />
      </div>
      <p>
        Theoria does not charge for AI usage. Requests are billed directly by
        OpenRouter under the account and limits you control.
      </p>

      {error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-message success-message" role="status">
          {message}
        </p>
      ) : null}

      {connection.status === "unavailable" ? (
        <p className="provider-issue">{issueMessage(connection)}</p>
      ) : null}

      {connection.status === "connected" ? (
        <>
          <dl className="provider-summary">
            <div>
              <dt>Provider</dt>
              <dd>OpenRouter</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{selectedDescriptor?.name ?? "No model available"}</dd>
            </div>
            {connection.account?.spendRemaining !== undefined ? (
              <div>
                <dt>Key limit remaining</dt>
                <dd>
                  {connection.account.spendRemaining.toLocaleString()}{" "}
                  OpenRouter credits
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="technical-note">
            Manage credit limits and provider spending in your OpenRouter
            account. Theoria does not keep a usage ledger.
          </p>
          <div className="actions">
            <Button
              className="button-secondary"
              disabled={busy || models.length === 0}
              onClick={() => setChangingModel((visible) => !visible)}
            >
              Change model
            </Button>
          </div>
          {changingModel ? (
            <div className="provider-model-picker">
              <Field
                label="Search models"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or model ID"
              />
              <label className="field">
                <span>OpenRouter model</span>
                <select
                  value={selectedModel}
                  onChange={(event) => void chooseModel(event.target.value)}
                >
                  {filteredModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} · {model.id}
                    </option>
                  ))}
                </select>
                <small>{filteredModels.length} matching models</small>
              </label>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <Button disabled={busy} onClick={() => void connect()}>
            {busy ? "Checking…" : "Connect OpenRouter"}
          </Button>
          <details className="provider-advanced">
            <summary>Advanced</summary>
            <form onSubmit={(event) => void saveManualKey(event)}>
              <Field
                label="Paste OpenRouter API key"
                name="apiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                hint="Stored only in IndexedDB on this device. The full key is never shown after saving."
                required
              />
              <Button className="button-secondary" disabled={busy}>
                Save API key
              </Button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
