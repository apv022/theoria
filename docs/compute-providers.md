# External compute providers

## Decision

Theoria has no paid Pro product surface. Core learning, creation, publishing, and advanced creator
tools are free. Features requiring third-party compute use user-controlled provider credentials or
local compute. Theoria does not intermediate compute billing.

OpenRouter is the only initial external provider. Local models, Ollama, OpenAI-compatible
endpoints, and custom providers remain possible future adapters, not commitments in the roadmap.
There is no subscription, entitlement, credit, invoice, payment, or persistent usage-ledger
architecture.

## Provider boundary

`@theoria/ai-provider` defines provider-neutral model discovery and text-generation requests and
results. Course Factory will depend on that interface rather than an OpenRouter payload. Provider
adapters translate only at their network boundary. Provider errors retain a safe code and optional
HTTP status, not credentials or raw response bodies.

The initial OpenRouter adapter uses the documented bearer API-key contract for account metadata,
model listing, and non-streaming chat completion. It normalizes text, finish reason, token usage,
OpenRouter-credit cost, and typed failures before a Creation caller sees the result.

`/settings/ai-providers` provides the preferred OpenRouter PKCE connection and an advanced manual
API-key fallback. The browser creates a high-entropy verifier and state, sends only the S256
challenge to OpenRouter, and keeps the transaction in `sessionStorage`. OpenRouter redirects to the
canonical `/settings/ai-providers` callback with a short-lived code. The callback validates the
state, exact origin/path, and ten-minute lifetime; removes the transaction; cleans the callback URL;
and exchanges the code directly with OpenRouter. No Theoria server participates. The returned key
is written to IndexedDB only after a successful exchange. Disconnect deletes it immediately.

`NEXT_PUBLIC_SITE_URL` supplies the canonical callback origin. Production values must be HTTPS
origins with no path, query, fragment, or embedded credentials. OpenRouter documents unrestricted
ports for localhost callbacks, so no separate development client registration is required.

The model selector reads the authenticated OpenRouter model list, supports name/ID search, and
persists the selected model alongside the device-local credential. It never asserts that a model is
available unless OpenRouter returned it. If a saved model disappears, the UI selects the first
current model and explains the fallback. Key-limit metadata from OpenRouter is shown when present;
Theoria does not maintain a usage ledger or billing controls.

## Credential boundary

`IndexedDbLocalStore.credentials` implements the provider credential-store interface in the
`providerCredentials` object store. Credentials survive reloads and are removed through the same
abstraction when a user disconnects. They are deliberately absent from:

- `localStorage` and URLs;
- React connection-state values and server-rendered props;
- account-sync categories, outbox records, and remote payloads;
- Supabase profiles, application tables, and Storage;
- MCF drafts, packages, compilation records, exports, and analytics.

IndexedDB does not protect a credential from malicious JavaScript executing in Theoria's origin.
The application must continue to reject imported executable content, sanitize rendered content,
keep package previews in opaque-origin sandboxes, avoid third-party scripts on credential screens,
and never log provider request headers. The connection UI explains that credentials are
device-local and provides an explicit Disconnect action. A browser or device reset also removes the
credential; it is not recoverable from the Theoria account.

## Official OpenRouter references

- [OAuth with PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- [List available models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- [Chat completion](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)
- [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
- [API errors and error types](https://openrouter.ai/docs/api_reference/errors-and-debugging)
- [Current key metadata and limits](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key)
- [API-key management and limits](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)

## MCF invariant

Future Course Factory output is an ordinary MCF 1.1 draft. The existing deterministic validator
and compiler remain authoritative; the creator reviews generated material in Studio and publishes
only through the existing explicit pipeline. Batch Upload consumes ordinary MCF packages. Neither
tool may introduce a proprietary representation, cloud-only package, AI-specific course type,
second publishing format, alternate Reader runtime, or automatic publishing path.
