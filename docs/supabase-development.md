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

Automated browser tests use a disposable in-process Auth/PostgREST protocol fixture on port 55431.
It exercises SDK/session/UI behavior without production access. Database constraints and RLS are
tested separately by pgTAP against the local Supabase stack.

## Migrations and production

All database changes belong in timestamped `supabase/migrations/*.sql` files. To deploy:

1. run local reset, pgTAP tests, and lint;
2. link only the intended staging project;
3. inspect `corepack pnpm supabase db push --dry-run`;
4. apply to staging and run auth journeys;
5. use the reviewed migration workflow for production.

Never run `db reset --linked` against production, include development seed data in production, or
place database passwords, direct Postgres URLs, secret keys, or service-role keys in browser
configuration. Browser code accepts only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Publishing tables, package/draft sync, progress sync, compilation sync, storage uploads,
organizations, moderation, and account deletion are deferred.
