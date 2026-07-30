# Local data model

The IndexedDB database is `theoria`, currently schema version 5.

| Store           | Key         | Contents                                                                      |
| --------------- | ----------- | ----------------------------------------------------------------------------- |
| `drafts`        | `id`        | Canonical source, normalized authoring state, validation, and editor recovery |
| `packages`      | `id`        | One validated source archive, manifest, checksum, size, and validation result |
| `library`       | `packageId` | Display metadata and a reference to `packages` or `compilations`              |
| `progress`      | `packageId` | Versioned learner state                                                       |
| `compilations`  | `id`        | Source archive, compiled artifact, diagnostics, and compiler history          |
| `syncSettings`  | `key`       | Device identity, consent, cursor, success time, and pause reason              |
| `syncRecords`   | `id`        | Per-category revision, dirty/tombstone, error, and artifact state             |
| `syncOutbox`    | `id`        | Durable pending or failed put/delete operations                               |
| `syncConflicts` | `id`        | Recoverable conflict metadata and conflict-copy identity                      |

Learner state schema 1 includes stable local package, package-version, and content-checksum
identifiers; a monotonic revision; started, updated, opened, submitted, and completion timestamps;
current lesson; responses; checked/submitted/attempt counts; earned points; automatic and
provisional assessment results; manual-review state; activity and lesson completion; assignment
submissions; and deterministic pool/matching/ordering selections.

Opening progress with a different package version or content checksum starts a new compatible
record rather than applying stale answers to changed content. The v2-to-v3, v3-to-v4, and v4-to-v5
database migrations are additive. They retain every existing store and record; draft compatibility is
checked per record without rewriting source bytes during database open. This shape is intentionally
used for revision/timestamp-based synchronization, while the browser remains authoritative.

Restart deletes only `progress`. Removing a source-imported library item also deletes its package
blob. Removing a compilation-backed item does not delete compilation history. Package bytes and
learner state are always separate.

Draft, package, library, and compilation record types accept an optional
`{ type: "user", userId, claimedAt }` ownership reference. Existing records are not rewritten and
signing in performs no IndexedDB scan. Once per-device consent is enabled, writes update their
sync record and durable outbox; unclaimed drafts remain excluded. Progress deletion increments its
reset generation. Other deletions retain tombstones so an offline device cannot resurrect stale
state.
