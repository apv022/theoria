# Account synchronization

Theoria is local-first: IndexedDB is the immediate working state and Supabase is an optional,
private synchronization and recovery layer. Authoring, learning, library use, and compilation do
not require an account or network. React calls the framework-independent `@theoria/sync` engine;
only `@theoria/platform-client` communicates with Supabase.

## Consent and device enablement

Signing in does not scan, upload, merge, overwrite, or delete local records. `/settings/sync`
first shows local and remote counts and offers four explicit choices:

- merge local and cloud records;
- upload owned local records before reconciling;
- download cloud records without first enqueueing local records;
- keep this device local-only.

Enabling registers that browser's persistent random device ID. An unclaimed draft is excluded
until its owner explicitly claims it in Studio. Disabling unregisters the device but retains all
local records and queued work.

## Processing

IndexedDB schema 6 records per-item revisions, tombstones, artifact state, errors, a cursor, and a
durable outbox. The engine pulls paginated records after the cursor, reconciles them, then pushes
queued operations with expected server revisions and stable idempotency keys. It checks SHA-256
before immutable blob upload. A successful run records its cursor and completion time.

The `providerCredentials` object store is not a sync category. Account-sync planning, outbox
generation, remote payload encoding, Supabase records, and recovery blobs cannot enumerate it.

Enabled devices attempt background synchronization after local changes and on reconnect.
Operations stop between records when cancelled. Network loss or session expiration pauses work;
the outbox remains durable and can be retried from `/settings/sync`. Each operation is attempted at
most five times until a user or later implementation explicitly retries it.

## Artifacts

Draft archives, imported local packages, compilation sources, compiled outputs, and nested binary
record fields are replaced in remote JSON by typed checksum references. The application uploads
objects up to 25 MiB. Larger objects produce a truthful `metadata_only` record and remain on the
originating device. The database and private bucket independently reject objects over 50 MiB.
See [storage.md](storage.md) for paths and authorization.

## Known limitations

- Upload progress from Supabase Storage is coarse rather than byte-streamed.
- Operations are resumable at record boundaries, not within one object upload.
- Background synchronization requires an open browser page; no critical write depends on the
  service worker after the page closes.
- An artifact marked `metadata_only` cannot reconstruct its original bytes on a second device; the
  metadata and history remain visible.
- Automatic retry is bounded by five stored attempts and uses reconnect/change triggers plus a
  short in-page delay, not a long-running server scheduler.
- Conflict review exports metadata; source archives are exported through their existing Studio or
  compiler controls.
