# Synchronization conflicts

Server writes use an expected revision. A mismatched revision is pulled and reconciled before a
later retry; no last-writer-wins overwrite bypasses this check.

## Source-bearing records

Draft source trees are never merged automatically. Independent draft changes preserve the local
primary and restore the remote version as a clearly labelled conflict copy. The review panel shows
timestamps, device IDs, local and remote revisions, and available source checksums. A creator can
inspect a draft copy, export conflict metadata, keep both, or delete either copy. Deleting the
primary creates the ordinary synchronized tombstone; deleting a local conflict copy does not
invent a remote record.

Imported packages and compilation records follow the same preserve-both rule when stable IDs
collide with different checksums. Identical immutable checksums deduplicate. Compilation history is
otherwise a union.

## Learner progress

Records are isolated by their stable package/version/content identity. Within the same reset
generation, safe facts merge: viewed and completed flags form a union, attempt counts and valid
scores take the maximum, manual-review flags are retained, and the newer complete state supplies
internally related deterministic order and pool selections. An explicit restart increments
`resetGeneration`; the higher generation wins so old answers cannot reappear.

The current model can merge all represented learner fields using those rules. If a future schema
introduces a field without a safe merge, it must preserve the newest complete state and write a
recoverable conflict record before that schema is enabled for synchronization.

## Library records and deletion

Independent additions form a union because each item has its own stable package identity. For one
item, the earliest addition and latest opening facts are retained. Deletions are revisioned
tombstones. The newer tombstone propagates and prevents an older offline addition from immediately
resurrecting the entry.
