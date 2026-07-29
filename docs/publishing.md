# Publishing

Publishing is an explicit online operation available only to an authenticated creator who has
claimed the local draft. Signed-out authoring, validation, preview, source export, compilation,
library use, and reading are unchanged.

## Workflow and trust boundary

1. Creation Studio regenerates the current source and runs the real `mcf-browser` worker validator.
2. Validation errors block the action. Studio submits the exact validated `.mcf.zip`, its SHA-256
   checksum, manifest summary, validation summary, semantic version, visibility, and release notes.
3. The same-origin Next.js route requires a cookie-backed user and rejects cross-origin or
   malformed requests.
4. The platform adapter independently hashes the received bytes. A mismatch fails before upload.
5. It uploads once, without upsert, under the authenticated owner path.
6. `publish_package_version` verifies the caller, path, object owner, package owner, slug,
   uniqueness, and successful validation evidence in one database transaction. It inserts the
   immutable version and advances `latest_version_id`.
7. The adapter removes an unfinalized upload after cancellation or finalization failure where
   practical.

The server does **not** run MCF semantic validation in Stage Six. The semantic result comes from
the real browser engine. The server protects that evidence by re-hashing the exact canonical
archive, authorizing its Storage object, validating the summary shape/state, and atomically
finalizing metadata. Compiled learner output is derived and is never canonical source.

Publishing progress describes checking, upload, and finalization. Cancellation is safe before
finalization; once the database operation completes, the release is immutable. Retry uses a fresh
request and never enables overwrite.

## Local-first effect

Success writes only `remotePackageId`, `slug`, `lastPublishedVersion`, `publishedChecksum`, and
`publishedAt` into the existing draft record. It does not delete or replace that draft. It does not
enumerate or upload unrelated drafts, learner progress, the library, or compilation history.
Editing continues immediately and a later release requires a new package version.

See [package-versioning.md](package-versioning.md), [storage.md](storage.md), and
[authorization.md](authorization.md).
