# Architecture

## Governing split

The browser owns package execution and local state. A future server owns identity, permissions,
distribution, shared repository state, and synchronization.

## Product and compute decision

Theoria has no paid Pro product surface. Core learning, creation, publishing, and advanced creator
tools are free. Features requiring third-party compute use user-controlled provider credentials or
local compute. Theoria does not intermediate compute billing.

The boundary is Theoria-native/local functionality versus external compute, not Free versus Pro.
An unavailable provider must not block learning, Studio, publishing, or other local workflows.
Course Factory and Batch Upload belong to Creation; they are not separate products, repositories,
frontends, entitlements, or subdomains.

```text
Next.js route shell
        |
        v
compiler client ──typed messages──> Web Worker
        |                               |
        |                               +─ secure ZIP/directory import
        |                               +─ normalized virtual filesystem
        |                               +─ MCF 1.1 version gate + mcf-npm validation
        |                               +─ diagnostics and learner compilation
        |
        +─ IndexedDB local-store
        +─ sandboxed opaque-origin preview
        +─ source / artifact downloads

library / reader client ──────────> the same Web Worker normalization
        |
        +─ shared reader domain runtime
        +─ IndexedDB package references + learner records
        +─ safe rich-content rendering + local object URLs
        +─ service-worker application shell

Studio client ───────────────────> canonical source-first draft
        |                               |
        |                               +─ exact secure virtual files
        |                               +─ last worker-normalized package
        |                               +─ stable-ID authoring commands
        |                               +─ deterministic MCF serializer
        |
        +─ debounced mcf-browser validation
        +─ IndexedDB autosave
        +─ compile → real /read preview

future creator compute ─────────> provider-neutral AI interface
        |                               |
        |                               +─ OpenRouter (initial adapter)
        |                               +─ other adapters (deferred)
        |
        +─ device-local IndexedDB credential
        +─ no account sync, MCF serialization, or Theoria billing

account UI ──────────────────────> platform-client interfaces
                                        |
                                        +─ Supabase adapter
                                        +─ Auth session + refresh
                                        +─ public profile queries under RLS

repository pages ────────────────> platform-client repository
                                        |
                                        +─ Postgres full-text/trigram indexes
                                        +─ public-only listing RPC
                                        +─ bounded stable pagination
                                        +─ direct package/version reads under RLS

local writes ──> IndexedDB schema 6 ──> durable outbox
                         |                     |
                         |              framework-independent sync engine
                         |                     |
                         +<── reconciliation <─+─> platform-client sync
                                                     |
                                                     +─ private Postgres records
                                                     +─ private immutable Storage blobs

Studio publish ──same-origin──> Next.js publishing route
        |                               |
        +─ real worker validation       +─ re-hash canonical archive
        +─ canonical source ZIP         +─ private Supabase Storage upload
                                        +─ controlled database finalization
```

The web app exposes the compute boundary at `/settings/ai-providers`. OpenRouter authorization uses
a canonical-site callback and direct browser PKCE exchange; it is independent of Supabase account
authentication. Provider responses are normalized at the adapter boundary, and failed provider
requests do not mutate package drafts.

Supabase is optional and owns identity, public profiles, repository metadata, package ownership,
visibility, canonical published source objects, and the optional account recovery layer. IndexedDB
remains authoritative for immediate runtime state. Server Components and the request proxy use
cookie-backed account sessions where needed; imported package execution remains entirely in the
browser.

Explore URL state is server-readable and shareable. A small client control layer debounces query
changes and announces loading, while Server Components fetch typed pages. Search never downloads
archives. A deliberate Add to Library action resolves one authorized canonical source and sends it
through the same secure `mcf-browser` import and validation path as a local file.

## Route layouts

| Layout        | Routes                                                                             | Navigation boundary                                 |
| ------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| Public        | `/`, `/explore`, `/packages/[slug]`, `/profiles/[handle]`, `/library`, `/settings` | Explore, Library, Create, Search, Account           |
| Reader        | `/read/[packageId]`, `/read/[packageId]/[lessonId]`                                | Package outline, progress, and Exit reader only     |
| Studio        | `/studio`, `/studio/[draftId]`, `/studio/factory`, `/studio/batch-upload`          | Studio, Course Factory, and Batch Upload            |
| Compiler      | `/compile`                                                                         | Import, validation, compilation, preview, history   |
| Institutional | `/org/[orgSlug]`                                                                   | Isolated placeholder; absent from public navigation |

## Dependency direction

`package-model`, `ai-provider`, and `creation-tools` are framework-independent domain boundaries. `mcf-browser`,
`reader`, `authoring`, and `platform-client` depend on package-model; `local-store` implements the
provider credential-store interface without making credentials package records. `sync` depends on
local-store and platform-client interfaces but has no React or Supabase dependency. `reader`
consumes the normalized `mcf-browser` model but contains no React or storage code. `authoring` owns
draft transformations and source generation, not parsing. `ui` uses only secret-free provider
connection state. `apps/web` composes the packages.
Supabase-specific calls stay in the platform adapter and request infrastructure. Platform
interfaces do not leak into package execution or IndexedDB.

## Local-first ownership

Database `theoria`, schema version 6, contains:

- `drafts`, keyed by draft ID;
- `packages`, keyed by package ID;
- `library`, keyed by package ID;
- `progress`, keyed by package ID;
- `compilations`, keyed by stable local UUID, with `createdAt` and `sourceChecksum` indexes.
- `syncSettings`, `syncRecords`, `syncOutbox`, and `syncConflicts`, added without rewriting any
  content record.
- `providerCredentials`, keyed by provider ID and deliberately excluded from every sync category.

A compilation record includes identity, kind, MCF version, source checksum, source archive,
compiled artifact, validation, diagnostics, timestamps, and sync state. Synchronization uploads it
without changing its local identity or taking over local writes.

Library entries reference either an imported package record or an existing compilation record; they
do not duplicate large archives. Learner progress has stable package/version/content IDs,
monotonic revisions, timestamps, response and assessment state, and persisted random orders.
The v2-to-v3, v3-to-v4, v4-to-v5, and v5-to-v6 upgrades are additive and leave compiler, library,
package, progress, and draft history untouched.

Drafts, library entries, imported packages, and compilations can carry an optional stable local
user-ownership reference. Existing records remain unclaimed. Claiming is explicit, and neither
session restoration nor profile updates enumerate or mutate IndexedDB.

A published draft adds only a remote package ID, stable slug, last version, checksum, and publishing
timestamp to its existing IndexedDB record. Publication never removes the draft, learner progress,
library state, or compilation history. Later local edits remain local and require a distinct
semantic version to publish.

## Preview isolation

Compiled HTML is read from the generated ZIP and passed to an iframe through `srcDoc`. The iframe
uses `sandbox="allow-scripts"` without `allow-same-origin`, navigation, popups, or top-level access.
Imported HTML and JavaScript are rejected before package parsing. Object URLs used for downloads are
revoked immediately after dispatch.

## Deferred server work

Organization membership, moderation, recommendations, and collaborative editing remain deferred.
Search and optional account synchronization are implemented; opaque or personalized discovery
ranking is not. Local compilation, drafts, progress, and library access remain account-independent.
