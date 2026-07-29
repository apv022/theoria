# Creation Studio

`/studio` creates course, module, or lesson packages and imports secure archives or package
directories. It lists local drafts with package kind, MCF version, validation status, revision, and
last edit time. Rename, duplicate, source export, and confirmed deletion operate entirely in
IndexedDB.

`/studio/[draftId]` is a focused workspace with one active panel: Content, Questions, Assets,
Metadata, Source, or Preview. A keyboard-operable package/source tree and grouped validation rail
remain available. Changes autosave after 350 ms and real worker validation begins after 700 ms.
Save and validation states are announced.

Visual editing covers:

- course chapters and ordered lessons;
- lesson metadata, nested completion expressions, and CommonMark activities;
- notes, practice, assessment, and assignment activities;
- automatic, manual, completion, and ungraded evaluation;
- every current question type and its type-specific MCF fields;
- weights, partial scoring, normalization, tolerances, units, response reuse, feedback, hints,
  explanations, points, and required state;
- assignment modes/media types and rubric links;
- package rubrics with criteria, levels, and points;
- common package metadata and lossless preservation of advanced metadata;
- declared assets with drag-and-drop/file-picker upload, checksums, duplicate detection, usage
  discovery, reference insertion, and alt text, captions, transcripts, attribution, and license
  metadata.

Source applies only after an explicit action and successful parsing refreshes the normalized model.
Leaving Source with an unapplied buffer requires confirmation. Diagnostics navigate to the relevant
file and line. Preview never shows a fake or stale model: it compiles current source, stores a
reference-backed authored library entry, and opens the actual Theoria reader. Desktop and mobile
preview sizes are available.

Imported packages are byte-preserving by default. The creator must explicitly accept visual
regeneration because formatting may change. Question-bank, asset-collection, and packages using
resolved question references stay source-only. They can still be validated, preserved, edited as
source, and exported.

Reordering is available by drag-and-drop and by labeled up/down controls. Lessons reorder within
their current chapter; moving a lesson between chapters remains a source-mode operation. Command
metadata is retained for a future undo/redo UI, but this stage does not expose history playback.
