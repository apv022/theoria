# Source round-tripping

Import uses the existing secure ZIP/directory boundary and `mcf-browser` parser. The exact extracted
file bytes become the canonical draft. Export of an untouched import produces the same deterministic
source archive and checksum.

Visual editing is an explicit transformation:

1. The creator accepts the regeneration boundary.
2. `packages/authoring` transforms the worker-normalized model using stable IDs.
3. A deterministic serializer emits manifest, chapter, lesson, activity, and question source.
4. Existing assets and unrelated files are merged without duplication.
5. `mcf-browser` reparses and validates the result.

The serializer is not a parser. It emits current MCF syntax for course, module, and lesson packages.
Literal markers inside Markdown/code remain untouched. Advanced metadata, extensions, completion
expressions, rubrics, and assignment fields present in the normalized model are serialized.

Question-bank references and other constructs whose normalized expansion cannot be losslessly
reconstructed are marked source-only. Direct Source mode preserves them. Invalid source never
replaces the last normalized visual model; diagnostics identify the conflict until corrected.
