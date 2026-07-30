# Theoria

Theoria is a repository-first, local-first home for portable MCF learning packages. This repository
contains the application foundation, a real browser compiler, a complete local-first learner
runtime, Creation Studio for MCF 1.0 and 1.1, and optional Supabase accounts.

## What works

- Distinct public, reader, Studio, compiler, and institutional route shells.
- `.mcf.zip` drag-and-drop and file selection.
- Directory selection through browsers that support `webkitdirectory`.
- Security-gated ZIP extraction and normalized virtual files.
- Manifest-first MCF 1.0/1.1 validation using the current `mcf-npm` implementation.
- Structured diagnostics in a dedicated Web Worker.
- Learner-renderable, deterministic compiled ZIP output and sandboxed preview.
- Source preservation/download and compiled ZIP download.
- IndexedDB compilation history that survives reloads.
- A device-local library for validated source packages and successful compiler outputs.
- Focused course, module, and lesson reading with resumable responses, scoring, completion,
  assignments, rubrics, and progress.
- A same-origin offline shell; opened packages and reader routes remain usable without a network.
- A source-first Creation Studio with autosaved drafts, visual builders, direct source editing,
  secure assets, real validation, reader preview, and source/compiled export.
- Optional email/password accounts, persistent sessions, public profiles, recovery flows, and
  explicit local ownership claims through an isolated platform adapter.
- Authenticated publication of real browser-validated canonical `.mcf.zip` sources as immutable,
  versioned public, unlisted, or private repository packages.
- Public repository browsing, indexed metadata search, filters, stable pagination, creator
  listings, and validation-gated Add to Library → Reader journeys.
- Explicit per-device account synchronization for owned drafts, progress, library records, private
  local package sources, and compilation history, with a durable IndexedDB outbox and private
  checksum-addressed recovery artifacts.
- Target-local fixtures representing MCF 1.0, compact MCF 1.1, and the authoring masterclass.

Question-bank and asset-collection packages validate but do not open in the learner. Manual work is
saved as pending review and is never assigned an invented grade. Remote media remains
network-dependent. Recommendations, ratings, collaborative editing, and LMS
behavior are intentionally deferred. Repository relevance is transparent Postgres full-text
ranking, not recommendation ranking. Signing in never uploads or merges browser-local records;
account sync starts only after an explicit choice at `/settings/sync`, and publishing remains a
separate explicit action.

## Requirements

- Node.js 22 or newer
- Corepack
- A modern browser

All package-manager caches can remain inside the checkout:

```bash
export COREPACK_HOME="$PWD/.corepack"
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000`. Creation Studio is at `/studio`, the local library is at `/library`,
and the compiler is at `/compile`.

Accounts are optional. Copy `.env.example` to `.env.local` and provide only
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Without them the app presents
local mode and all compiler, library, reader, and Studio workflows continue to work.

## Verification

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
PLAYWRIGHT_BROWSERS_PATH=/path/to/playwright-browsers corepack pnpm test:browser
corepack pnpm fixtures:prepare
corepack pnpm supabase start
corepack pnpm supabase db reset --local
corepack pnpm supabase test db --local
git diff --check
```

`fixtures/local/`, build output, dependency stores, and verification output are ignored. The
repository vendors the exact built `mcf-npm` 1.1.0 authority as
`vendor/mcf-npm-1.1.0.tgz`; no compiler repository is needed at install time and no donor build
scripts run during installation.

## Repository map

| Location                   | Responsibility                                                                 |
| -------------------------- | ------------------------------------------------------------------------------ |
| `apps/web`                 | Next.js App Router application and compiler interface                          |
| `packages/package-model`   | Framework-independent package and local record types                           |
| `packages/authoring`       | Canonical draft transformations and deterministic MCF source generation        |
| `packages/mcf-browser`     | Secure import, virtual filesystem, worker adapter, validation, and compilation |
| `packages/local-store`     | IndexedDB repositories                                                         |
| `packages/reader`          | Rendering, evaluation, completion, and resumable learner runtime               |
| `packages/platform-client` | Auth, profiles, repository, publishing, and isolated Supabase adapter          |
| `packages/ui`              | Small shared layout and control vocabulary                                     |
| `fixtures`                 | Fixture preparation policy; generated fixtures stay local                      |
| `docs`                     | Architecture and integration decisions                                         |

Start with [architecture.md](docs/architecture.md), [repository.md](docs/repository.md),
[search.md](docs/search.md), [visibility.md](docs/visibility.md),
[publishing.md](docs/publishing.md), [package-versioning.md](docs/package-versioning.md),
[authentication.md](docs/authentication.md), [learning-and-reader.md](docs/learning-and-reader.md),
and
[mcf-browser-integration.md](docs/mcf-browser-integration.md).
