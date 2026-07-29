# Canonical draft model

Draft schema 1 is source-first and stored in the version-4 `drafts` object store.

Each record contains:

- stable draft ID, package identity, kind, and MCF version;
- created/updated timestamps and monotonic revision;
- exact virtual source files with stable paths, text/binary classification, media type, bytes, and
  optional checksum;
- the last package normalized by `mcf-browser`;
- generated, imported-preserved, or source-edited mode;
- supported, regeneration-required, or source-only visual capability;
- validation result and source checksum;
- editor panel, selected content/source IDs, and preview size;
- bounded command metadata suitable for future undo/redo;
- optional original import and latest compilation reference.

Source files are canonical. The normalized package is never accepted from hand-written parsing:
only the worker can refresh it. Visual commands clone stable-ID normalized objects and
deterministically regenerate supported YAML/MCF files. Assets and unrelated source files are
retained. Source-only constructs block regeneration rather than being silently deleted.

Draft revisions and timestamps are synchronization-ready, but no synchronization exists.
