# Learning and reader

`/library` validates source archives through `mcf-browser` before saving them. A successful
compiler result can be added without copying its archive: the library entry references the
compilation record. Cards show identity, version, progress, completion, and actions for opening,
continuing, restarting responses, exporting artifacts, and removing local data.

`/read/[packageId]/[lessonId]` reopens the saved source through the worker and consumes its
normalized course, module, or lesson model. React receives reader-ready structures; it does not
parse MCF. `packages/reader` owns deterministic selection/order, response evaluation, scoring,
assessment submission, assignments, completion expressions, and safe rich-content conversion.
`packages/local-store` owns persistence.

The focused reader exposes only package navigation, the current lesson, progress, learner controls,
and an exit to the library. CommonMark/GFM tables, links, literal fenced code, KaTeX math, local
images, audio, video, declared assets, rubrics, and assignment instructions render inline. Imported
HTML and JavaScript are sanitized and never executed.

Responses save on change. Checks and submissions persist attempts, scores, review states, and
timestamps. Resume uses the saved lesson and the exact deterministic pool, matching order, and
ordering state. Restart removes learner progress only; remove deletes progress, the library entry,
and an exclusively imported package archive. Compilation history remains independently available.

The UI uses semantic landmarks and native controls, visible focus, live status text, minimum
touch-sized choices, horizontally scrollable tables, responsive package navigation, a skip link,
and reduced-motion behavior.
