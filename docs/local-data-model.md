# Local data model

The IndexedDB database is `theoria`, currently schema version 4.

| Store          | Key         | Contents                                                                      |
| -------------- | ----------- | ----------------------------------------------------------------------------- |
| `drafts`       | `id`        | Canonical source, normalized authoring state, validation, and editor recovery |
| `packages`     | `id`        | One validated source archive, manifest, checksum, size, and validation result |
| `library`      | `packageId` | Display metadata and a reference to `packages` or `compilations`              |
| `progress`     | `packageId` | Versioned learner state                                                       |
| `compilations` | `id`        | Source archive, compiled artifact, diagnostics, and compiler history          |

Learner state schema 1 includes stable local package, package-version, and content-checksum
identifiers; a monotonic revision; started, updated, opened, submitted, and completion timestamps;
current lesson; responses; checked/submitted/attempt counts; earned points; automatic and
provisional assessment results; manual-review state; activity and lesson completion; assignment
submissions; and deterministic pool/matching/ordering selections.

Opening progress with a different package version or content checksum starts a new compatible
record rather than applying stale answers to changed content. The v2-to-v3 and v3-to-v4 database
migrations are additive. They retain every existing store and record; draft compatibility is
checked per record without rewriting source bytes during database open. This shape is intentionally
ready for later revision/timestamp-based synchronization, but the browser remains authoritative.

Restart deletes only `progress`. Removing a source-imported library item also deletes its package
blob. Removing a compilation-backed item does not delete compilation history. Package bytes and
learner state are always separate.

Account support does not change the IndexedDB schema. Draft, package, library, and compilation
record types accept an optional `{ type: "user", userId, claimedAt }` ownership reference. Existing
records are not rewritten, signing in performs no IndexedDB scan, and claims remain local until a
future explicit synchronization stage.
