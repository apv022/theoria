# Verification audit

## Blockers

- Managed Supabase verification is blocked: `.env.local` is absent, so
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are not
  configured. The CLI is also unauthenticated and no project is linked.
- Local Supabase could not finish starting: its Podman database container exited
  with status 137 before migrations or pgTAP could run.

## Data-loss/security

- No remote project, migration, Storage object, or user data was changed.
- Static browser-output scan found no privileged Supabase credential or direct
  Postgres connection string in application sources.

## Functional

- Full package tests, webpack production build, and complete Playwright suite
  passed using the repository's disposable browser fixture.
- TeX-rich source serialization now preserves semantic backslashes through the
  real MCF parser and visual regeneration.

## Cosmetic

- The shared stylesheet now uses grayscale surfaces, rounded radius/shadow
  tokens, and the established Theoria sage (`#526b54`) for actions, focus,
  progress, and selected/success states.
- Hosted account, publishing, visibility, and two-device synchronization flows
  remain unverified until public environment configuration and a linked project
  are supplied.
