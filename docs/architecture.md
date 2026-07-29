# Architecture

## Governing split

The browser owns package execution and local state. A future server owns identity, permissions,
distribution, shared repository state, and synchronization.

```text
Next.js route shell
        |
        v
compiler client ──typed messages──> Web Worker
        |                               |
        |                               +─ secure ZIP/directory import
        |                               +─ normalized virtual filesystem
        |                               +─ mcf-npm 1.0 / 1.1 dispatch
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
```

There is no application backend and no Supabase configuration. Server Components currently provide
static route shells only; they do not execute imported packages.

## Route layouts

| Layout        | Routes                                                                             | Navigation boundary                                 |
| ------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| Public        | `/`, `/explore`, `/packages/[slug]`, `/profiles/[handle]`, `/library`, `/settings` | Explore, Library, Create, Search, Account           |
| Reader        | `/read/[packageId]`, `/read/[packageId]/[lessonId]`                                | Package outline, progress, and Exit reader only     |
| Studio        | `/studio`, `/studio/[draftId]`                                                     | Creation workspace and Exit workspace               |
| Compiler      | `/compile`                                                                         | Import, validation, compilation, preview, history   |
| Institutional | `/org/[orgSlug]`                                                                   | Isolated placeholder; absent from public navigation |

## Dependency direction

`package-model` is the leaf domain package. `mcf-browser`, `local-store`, `reader`, and
`platform-client` depend on it. `reader` consumes the normalized `mcf-browser` model but contains
no React or storage code. `ui` depends only on React/Next peer APIs. `apps/web` composes them.
Platform interfaces do not leak into package execution or IndexedDB.

## Local-first ownership

Database `theoria`, schema version 3, contains:

- `drafts`, keyed by draft ID;
- `packages`, keyed by package ID;
- `library`, keyed by package ID;
- `progress`, keyed by package ID;
- `compilations`, keyed by stable local UUID, with `createdAt` and `sourceChecksum` indexes.

A compilation record includes identity, kind, MCF version, source checksum, source archive,
compiled artifact, validation, diagnostics, timestamps, and sync state. Future synchronization can
upload a record without changing its local identity or taking over local writes.

Library entries reference either an imported package record or an existing compilation record; they
do not duplicate large archives. Learner progress has stable package/version/content IDs,
monotonic revisions, timestamps, response and assessment state, and persisted random orders.
The v2-to-v3 upgrade is additive and leaves compiler history untouched.

## Preview isolation

Compiled HTML is read from the generated ZIP and passed to an iframe through `srcDoc`. The iframe
uses `sandbox="allow-scripts"` without `allow-same-origin`, navigation, popups, or top-level access.
Imported HTML and JavaScript are rejected before package parsing. Object URLs used for downloads are
revoked immediately after dispatch.

## Deferred server work

Authentication, publishing, repository queries, organization membership, permissions, storage,
search, and synchronization remain interfaces in `platform-client`. Adding any of them must not make
local compilation, drafts, progress, or library access account-dependent.
