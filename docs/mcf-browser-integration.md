# MCF browser integration

## Semantic authority

The vendored `vendor/mcf-npm-1.1.0.tgz` is produced from current
`/home/apv/mcf-npm` built output with lifecycle scripts disabled. Its source paths of interest are:

- `src/package.ts`: manifest-first version dispatch and validation result;
- `src/parser.ts`: exact MCF 1.0 parser;
- `src/parser11.ts`: exact MCF 1.1 parser;
- `src/model.ts`: normalized package and diagnostic model;
- `src/yaml-profile.ts`: safe YAML profile and structured diagnostics;
- `src/references.ts`: Markdown token reference discovery;
- `src/reader/questions.ts`, `src/reader/progress.ts`: scoring/completion behavior reference;
- `src/compiler.ts`, `src/render.ts`: static compilation behavior reference.

Theoria does not use the custom parser in `theoria-core`.

## Adapter

The package is opened and security-checked by Theoria before semantic parsing. Safe bytes are mounted
at `/package`. Webpack replaces `node:fs/promises`, `node:path`, `node:crypto`, and
`package-reader.js` only while bundling `mcf-npm` for the worker:

- `shims/fs-promises.ts` implements `readFile`, `stat`, `realpath`;
- `shims/path.ts` provides portable POSIX-like path operations;
- `shims/crypto.ts` implements the synchronous SHA-256 interface used for asset integrity;
- `shims/package-reader.ts` opens only the already-mounted virtual directory.

`validatePackage("/package")` remains responsible for reading `manifest.yaml`, rejecting unsupported
versions, and dispatching exactly to MCF 1.0 or 1.1. There is no regex MCF parser and no version
guessing.

## Worker protocol

The main thread sends an archive or serialized directory files with `inspect`, `validate`, or
`compile`. The worker reports importing, extracting, validating, compiling, and packaging progress.
Results distinguish success, invalid input, unsupported learner compilation, cancellation, and fatal
worker failure. Cancellation terminates and recreates the worker, so it also interrupts synchronous
decompression.

## Compilation

For course, module, and lesson packages, the normalized `mcf-npm` model is adapted to a deterministic
single-page learner. It preserves lessons, activities, question controls, safe Markdown text,
fenced examples, and local completion state. Automatic objective questions use the normalized
answer, tolerance, and text-normalization fields; manual and open responses are explicitly marked
for manual review. Output timestamps are fixed and file order is sorted. Source assets and
attribution/readme files are copied below `source/`.

Question banks and asset collections validate but return an explicit unsupported result when asked
to compile. Full parity with the upstream multi-page reader—including weighted/partial advanced
scoring, complete manual review workflows, rubrics, rich media rewriting, KaTeX, and the complete
completion-expression evaluator—is deferred. The current artifact is learner-renderable and
truthful about that boundary; it does not manufacture compiler diagnostics or server results.

## Security limits

Before decompression:

- at most 4,096 entries;
- at most 64 MiB per expanded entry;
- at most 512 MiB total expanded bytes;
- at most 200:1 entry compression ratio;
- ZIP64 and encrypted entries rejected;
- duplicate names, traversal, absolute/Windows/control paths rejected;
- symlinks and special files rejected;
- executable/script/HTML/WASM extensions rejected.

SVG files must be UTF-8 and cannot contain scripts, foreign objects, embedded frames/objects,
event-handler attributes, active `javascript:`/HTML data URLs, doctypes, or entities. Imported HTML
and JavaScript are never executed.

## Parity fixtures

Browser tests cover:

- `/home/apv/mcf-samples/minimal` — MCF 1.0 course, 1 lesson, 1 activity, 0 questions;
- `/home/apv/examplecourses/archives/minimal.mcf.zip` — MCF 1.1 course, 1/1/0;
- `/home/apv/mcf-authoring-masterclass.mcf.zip` — MCF 1.1 course, 10/30/74.

Both existing TypeScript and Python CLIs accept all three. Browser validation matches version, kind,
validity, and counts; browser compilation succeeds for all three. Unit tests ensure literal
`mcf-question` and asset text inside fenced examples do not create objects or active references.
