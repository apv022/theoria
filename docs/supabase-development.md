# Supabase development

## Local setup

The pinned project CLI reads `supabase/config.toml`. A Docker-compatible container runtime is
required:

```bash
corepack pnpm supabase start
corepack pnpm supabase db reset --local
corepack pnpm supabase test db --local
corepack pnpm supabase db lint --local --level error
```

Mailpit is available at `http://127.0.0.1:54324`. The local API defaults to
`http://127.0.0.1:54321`; copy its public publishable key into `.env.local`. Never commit
`.env.local`.

Automated browser tests use a disposable in-process Auth/PostgREST/Storage protocol fixture on port 55431. It exercises SDK/session/publishing/UI behavior without production access. Database
constraints, metadata RLS, and Storage policies are tested separately by pgTAP against the local
Supabase stack.

## Migrations and production

All database changes belong in timestamped `supabase/migrations/*.sql` files. To deploy:

1. run local reset, pgTAP tests, and lint;
2. link only the intended staging project;
3. inspect `corepack pnpm supabase db push --dry-run`;
4. apply to staging and run auth journeys;
5. verify the private `package-sources` bucket and its policies in staging;
6. use the reviewed migration workflow for production.

Never run `db reset --linked` against production, include development seed data in production, or
place database passwords, direct Postgres URLs, secret keys, or service-role keys in browser
configuration. Browser code accepts only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

If a container runtime is unavailable, record the reset/pgTAP/lint commands as unexecuted; do not
substitute a hosted project as the test target. A production operator must review and apply
`20260730000000_package_publishing.sql` manually after the earlier migrations. The migration creates
the bucket idempotently, but production object retention and backup settings remain an operator
decision.

Draft sync, progress sync, library sync, compilation-history sync, organizations, discovery,
moderation, and account deletion are deferred.
