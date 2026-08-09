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

Automated browser tests use a disposable in-process Auth/PostgREST/Storage protocol fixture on port 55431. It exercises SDK/session/publishing/repository/UI behavior without production access.
Database constraints, metadata RLS, Storage policies, public search isolation, synchronization
ownership/revision rules, filters, sorting, and pagination are tested separately by pgTAP against
the local Supabase stack.

## Migrations and production

All database changes belong in timestamped `supabase/migrations/*.sql` files. To deploy:

1. run local reset, pgTAP tests, and lint;
2. link only the intended staging project;
3. inspect `corepack pnpm supabase db push --dry-run`;
4. apply to staging and run auth journeys;
5. verify the private `package-sources` and `account-sync` buckets and their policies in staging;
6. use the reviewed migration workflow for production.

The manual `Supabase migration release` workflow is dry-run-only by default, binds secrets through
a protected `staging` or `production` GitHub environment, serializes releases per environment, and
requires an explicit `apply` choice. A production web promotion must require its successful
apply-mode run; do not let Vercel promote schema-dependent application code first.

Never run `db reset --linked` against production, include development seed data in production, or
place database passwords, direct Postgres URLs, secret keys, or service-role keys in browser
configuration. Browser code accepts only `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the non-secret canonical origin
`NEXT_PUBLIC_SITE_URL`.

If a container runtime is unavailable, record the reset/pgTAP/lint commands as unexecuted; do not
substitute a hosted project as the test target. A production operator must review and apply all
five migrations through `20260802000000_repository_network.sql` in timestamp order. Inspect the
GIN, trigram, and public-listing indexes on staging data before production. The publishing and
synchronization migrations create their private buckets idempotently, but production object
retention and backup settings remain an operator decision.

Before applying or repairing `20260802000000_repository_network.sql`, use the Dashboard SQL editor
to inspect the actual schema:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('profiles', 'location'), ('profiles', 'website_url'),
    ('packages', 'parent_package_id'), ('packages', 'parent_version_id'),
    ('package_versions', 'source_size')
  )
order by table_name, column_name;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'profile_repository_summary', 'repository_package_network',
    'repository_starred_package_ids', 'set_package_star',
    'publish_package_version'
  )
order by p.proname, arguments;
```

- If the objects are absent, run the protected workflow against staging, smoke test it, then run it
  against production with `apply` selected.
- If every object and function signature already matches but migration history is absent, use
  `corepack pnpm supabase migration repair --linked --status applied 20260802000000`; repair changes
  history only and must not be used to conceal missing SQL.
- If the schema is partial, reconcile it explicitly before either push or repair.
- Afterward, require `migration list` to align and `db push --linked --dry-run` to report that the
  remote database is up to date.

Organizations, recommendations, moderation, and account deletion are deferred.
