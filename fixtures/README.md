# Fixtures

Human-maintained MCF packages live in `fixtures/sources/`. `minimal-1.0` is retained only to test the
intentional unsupported-version response. Run `pnpm fixtures:prepare` to generate
deterministic archives in `fixtures/local/` and validate every result with the workspace-pinned
`mcf-npm` CLI. Generated content is ignored by Git.

Fixture preparation fails when a source, manifest identity, validator, or validation result is
missing. Browser and round-trip tests must consume only `fixtures/local/`; machine-specific fixture
paths and conditional fixture skips are not permitted.
