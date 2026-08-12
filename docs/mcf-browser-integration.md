# MCF browser integration

## Semantic authority

The vendored `vendor/mcf-npm-1.1.0.tgz` is produced from current
`/home/apv/mcf-npm` built output with lifecycle scripts disabled. Its source paths of interest are:

- `src/package.ts`: manifest-first version dispatch and validation result;
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

The adapter reads only the declared `mcf` scalar from `manifest.yaml` before semantic validation.
MCF 1.0 receives the explicit deprecation message, and all other unsupported versions receive an
intentional unsupported-version result. Accepted MCF 1.1 packages then pass to
`validatePackage("/package")` for authoritative parsing and validation; Theoria does not guess a
version or parse package semantics with regular expressions.

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

- `/home/apv/examplecourses/archives/minimal.mcf.zip` — MCF 1.1 course, 1/1/0;
- `/home/apv/mcf-authoring-masterclass.mcf.zip` — MCF 1.1 course, 10/30/74.

Browser validation matches version, kind, validity, and counts for MCF 1.1. The retained MCF 1.0
fixture verifies clean rejection and is not a compatibility fixture. Unit tests ensure literal
`mcf-question` and asset text inside fenced examples do not create objects or active references.
