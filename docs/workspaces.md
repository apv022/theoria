# Workspace boundaries

## Learning

The public repository, local library, package detail, and reader routes form the Learning workspace.
The reader has its own layout so repository and authoring controls cannot crowd focused study.
IndexedDB is the authority for future local library entries and learner progress.

The current repository cards and reader content are explicitly previews. They do not claim live
search, rankings, remote downloads, or full reader migration.

## Creation

Studio owns authoring intent and draft structure. It does not absorb the compiler toolbar. The
working `/compile` route is a focused creation tool for source import, validation, compilation,
preview, downloads, and compilation history. Full authoring controls remain out of scope.

Publishing will eventually cross from browser-owned compilation to server-owned distribution
through `platform-client`. It must be a deliberate action after a valid local artifact exists.

## Institutional

`/org/[orgSlug]` proves the separate route and navigation shell. Courses, sections, submissions,
grading, and administration are unfinished. No institutional navigation appears in the public,
reader, Studio, or compiler layouts.

## Progressive disclosure

- Public visitors see discovery, local library, creation entry, search, and account entry.
- Learners entering a package see only reading context.
- Creators entering Studio see draft context.
- Compiler users see only package processing and history.
- Institutional users reach an isolated shell by direct organization route.

This avoids advertising future systems as though they already work.
