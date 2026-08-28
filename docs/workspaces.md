# Workspace boundaries

## Learning

The public repository, local library, package detail, and reader routes form the Learning workspace.
The reader has its own layout so repository and authoring controls cannot crowd focused study.
IndexedDB is the authority for future local library entries and learner progress.

The current repository cards and reader content are explicitly previews. They do not claim live
search, rankings, remote downloads, or full reader migration.

## Creation

Creation is free and owns Studio, Course Factory, and Batch Upload. They are one toolset, not
separate products or Pro surfaces. Studio owns authoring intent and draft structure. Factory hands
validated generated drafts to Studio for human review. Batch Upload orchestrates local validation
and the existing single-package publishing operation. The compiler tool handles source import,
validation, compilation, preview, downloads, and compilation history.

Publishing crosses from browser-owned compilation to server-owned distribution through
`platform-client`. It remains a deliberate action after a valid local artifact exists.

## Institutional

`/org/[orgSlug]` proves the separate route and navigation shell. Courses, sections, submissions,
grading, and administration are unfinished. No institutional navigation appears in the public,
reader, Studio, or compiler layouts.

## Progressive disclosure

- Public visitors see discovery, local library, creation entry, search, and account entry.
- Learners entering a package see only reading context.
- Creators entering Creation can move among Studio, Course Factory, and Batch Upload without a
  second global navigation.
- Compiler users see only package processing and history.
- Institutional users reach an isolated shell by direct organization route.

This avoids advertising future systems as though they already work.
