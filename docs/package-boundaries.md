# Package boundaries

## `package-model`

Framework-independent types for branded package/draft IDs, MCF versions, all MCF 1.1 package kinds,
visibility, manifests, validation, drafts, library entries, progress, imported archives, and
sync-ready compilation records. It imports no browser, React, persistence, or platform code.

## `mcf-browser`

Owns imported bytes and package execution:

- ZIP central-directory inspection and bounded extraction;
- directory normalization;
- an in-memory filesystem used by the authoritative parser;
- manifest-first MCF version dispatch;
- worker requests, results, progress, cancellation, unsupported/fatal states;
- structured diagnostic conversion;
- deterministic learner artifact creation;
- compiled-index extraction for preview.

It depends on `package-model`, the vendored `mcf-npm` build, `fflate`,
`path-browserify`, and a small synchronous SHA-256 implementation required by MCF 1.1 integrity
validation.

## `local-store`

Defines storage interfaces and one real raw-IndexedDB implementation. React components never open
transactions or define object-store schemas. The web compiler calls this package only after a
successful compile.

## `platform-client`

Owns account, profile, ownership, repository, publishing, and synchronization interfaces. Its
Supabase adapter implements only authentication and profiles. Supabase query and Auth types stop at
this boundary; repository, publishing, organizations, and synchronization remain unimplemented.

## `ui`

Shared brand, navigation, buttons, fields, notices, status chips, and skip link. Route-specific
cards, compiler panels, reader content, and Studio forms stay in the application; they are not
promoted into an oversized generic design system.

## `apps/web`

Composes route layouts and client workflows. It may depend on all packages above. No package imports
from the app.
