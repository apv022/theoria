create table public.packages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  slug text not null unique,
  title text not null,
  description text not null default '',
  visibility text not null default 'private',
  latest_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_slug_normalized check (slug = lower(trim(slug))),
  constraint packages_slug_format check (slug ~ '^[a-z][a-z0-9-]{2,62}$'),
  constraint packages_title_length check (char_length(title) between 1 and 200),
  constraint packages_description_length check (char_length(description) <= 4000),
  constraint packages_visibility check (
    visibility in ('public', 'unlisted', 'private')
  ),
  unique (id, owner_id)
);

create table public.package_versions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete restrict,
  version text not null,
  mcf_version text not null,
  package_kind text not null,
  source_storage_path text not null unique,
  source_checksum text not null,
  manifest_summary jsonb not null,
  validation_summary jsonb not null,
  release_notes text not null default '',
  published_at timestamptz not null default now(),
  constraint package_versions_unique_release unique (package_id, version),
  constraint package_versions_identity_pair unique (id, package_id),
  constraint package_versions_semver check (
    version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
  ),
  constraint package_versions_mcf check (mcf_version in ('1.0', '1.1')),
  constraint package_versions_kind check (
    package_kind in (
      'course', 'module', 'lesson', 'question_bank', 'asset_collection'
    )
  ),
  constraint package_versions_checksum check (
    source_checksum ~ '^[0-9a-f]{64}$'
  ),
  constraint package_versions_source_path check (
    source_storage_path ~ '^packages/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+/[0-9a-f]{64}\.mcf\.zip$'
    and source_storage_path like '%/' || source_checksum || '.mcf.zip'
  ),
  constraint package_versions_manifest_object check (
    jsonb_typeof(manifest_summary) = 'object'
  ),
  constraint package_versions_validation_valid check (
    jsonb_typeof(validation_summary) = 'object'
    and validation_summary ->> 'state' = 'valid'
  ),
  constraint package_versions_release_notes_length check (
    char_length(release_notes) <= 10000
  )
);

alter table public.packages
  add constraint packages_latest_version_same_package
  foreign key (latest_version_id, id)
  references public.package_versions(id, package_id)
  deferrable initially deferred;

comment on table public.packages is
  'Stable repository identities. Source archives live in the private package-sources bucket.';
comment on table public.package_versions is
  'Immutable published MCF source releases. Compiled output is not canonical.';

alter table public.packages enable row level security;
alter table public.package_versions enable row level security;

revoke all on table public.packages from anon, authenticated;
revoke all on table public.package_versions from anon, authenticated;
grant select on table public.packages to anon, authenticated;
grant select on table public.package_versions to anon, authenticated;

create policy "Visible packages or owner can read"
  on public.packages
  for select
  to anon, authenticated
  using (
    visibility in ('public', 'unlisted')
    or owner_id = (select auth.uid())
  );

create policy "Visible package versions or owner can read"
  on public.package_versions
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.packages package
      where package.id = package_versions.package_id
        and (
          package.visibility in ('public', 'unlisted')
          or package.owner_id = (select auth.uid())
        )
    )
  );

create function public.reject_published_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'published package versions are immutable'
    using errcode = '55000';
end;
$$;

create trigger package_versions_are_immutable
  before update or delete on public.package_versions
  for each row execute function public.reject_published_version_mutation();

create function public.protect_package_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'package ownership is immutable'
      using errcode = '55000';
  end if;
  new.slug = lower(trim(new.slug));
  new.title = trim(new.title);
  new.description = trim(new.description);
  new.created_at = old.created_at;
  new.updated_at = now();
  return new;
end;
$$;

create trigger protect_package_identity
  before update on public.packages
  for each row execute function public.protect_package_identity();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'package-sources',
  'package-sources',
  false,
  52428800,
  array['application/zip', 'application/x-zip-compressed']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.can_read_package_source(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.package_versions version
    join public.packages package on package.id = version.package_id
    where version.source_storage_path = object_name
      and (
        package.visibility in ('public', 'unlisted')
        or package.owner_id = auth.uid()
      )
  );
$$;

create policy "Authorized package source downloads"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'package-sources'
    and public.can_read_package_source(name)
  );

create policy "Owners read their package source uploads"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'package-sources'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'packages'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "Owners upload bounded package source paths"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'package-sources'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'packages'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and name ~ '^packages/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+/[0-9a-f]{64}\.mcf\.zip$'
  );

create policy "Owners remove only unfinalized package sources"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'package-sources'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'packages'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and not exists (
      select 1
      from public.package_versions version
      where version.source_storage_path = name
    )
  );

create function public.package_slug_available(
  candidate text,
  existing_package_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(trim(candidate)) ~ '^[a-z][a-z0-9-]{2,62}$'
    and not exists (
      select 1
      from public.packages package
      where package.slug = lower(trim(candidate))
        and not (
          package.id = existing_package_id
          and package.owner_id = auth.uid()
        )
    );
$$;

create function public.package_version_available(
  candidate_package_id uuid,
  candidate_version text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.packages package
    where package.id = candidate_package_id
      and package.owner_id = auth.uid()
  )
  and not exists (
    select 1
    from public.package_versions version
    where version.package_id = candidate_package_id
      and version.version = candidate_version
  );
$$;

create function public.publish_package_version(
  requested_package_id uuid,
  requested_slug text,
  requested_title text,
  requested_description text,
  requested_visibility text,
  requested_version text,
  requested_mcf_version text,
  requested_package_kind text,
  requested_source_storage_path text,
  requested_source_checksum text,
  requested_manifest_summary jsonb,
  requested_validation_summary jsonb,
  requested_release_notes text
)
returns table (
  package_id uuid,
  version_id uuid,
  slug text,
  version text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_package public.packages;
  target_version public.package_versions;
  normalized_slug text := lower(trim(requested_slug));
  expected_path text;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if requested_package_id is null then
    requested_package_id := gen_random_uuid();
  end if;
  expected_path :=
    'packages/' || caller_id::text || '/' || requested_package_id::text || '/'
    || requested_version || '/' || requested_source_checksum || '.mcf.zip';
  if requested_source_storage_path <> expected_path then
    raise exception 'source storage path does not match publication identity'
      using errcode = '22023';
  end if;
  if requested_validation_summary ->> 'state' <> 'valid' then
    raise exception 'a successful browser validation result is required'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(requested_validation_summary -> 'diagnostics', '[]'::jsonb)
    ) diagnostic
    where diagnostic ->> 'severity' = 'error'
  ) then
    raise exception 'validation summary contains errors'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'package-sources'
      and object.name = requested_source_storage_path
      and object.owner_id = caller_id::text
  ) then
    raise exception 'verified source upload is missing'
      using errcode = '22023';
  end if;

  select * into target_package
  from public.packages package
  where package.id = requested_package_id
  for update;

  if found then
    if target_package.owner_id <> caller_id then
      raise exception 'package belongs to another creator'
        using errcode = '42501';
    end if;
    if target_package.slug <> normalized_slug then
      raise exception 'published package slugs are stable'
        using errcode = '22023';
    end if;
    update public.packages package
    set
      title = requested_title,
      description = requested_description,
      visibility = requested_visibility
    where package.id = requested_package_id;
  else
    if not public.package_slug_available(normalized_slug, null) then
      raise exception 'package slug is unavailable'
        using errcode = '23505';
    end if;
    insert into public.packages (
      id, owner_id, slug, title, description, visibility
    )
    values (
      requested_package_id,
      caller_id,
      normalized_slug,
      trim(requested_title),
      trim(requested_description),
      requested_visibility
    )
    returning * into target_package;
  end if;

  if exists (
    select 1
    from public.package_versions release
    where release.package_id = requested_package_id
      and release.version = requested_version
  ) then
    raise exception 'package version already exists'
      using errcode = '23505';
  end if;

  insert into public.package_versions (
    package_id,
    version,
    mcf_version,
    package_kind,
    source_storage_path,
    source_checksum,
    manifest_summary,
    validation_summary,
    release_notes
  )
  values (
    requested_package_id,
    requested_version,
    requested_mcf_version,
    requested_package_kind,
    requested_source_storage_path,
    requested_source_checksum,
    requested_manifest_summary,
    requested_validation_summary,
    trim(requested_release_notes)
  )
  returning * into target_version;

  update public.packages package
  set latest_version_id = target_version.id
  where package.id = requested_package_id;

  return query
  select
    requested_package_id,
    target_version.id,
    normalized_slug,
    target_version.version,
    target_version.published_at;
end;
$$;

revoke all on function public.reject_published_version_mutation() from public;
revoke all on function public.protect_package_identity() from public;
revoke all on function public.can_read_package_source(text) from public;
revoke all on function public.package_slug_available(text, uuid) from public;
revoke all on function public.package_version_available(uuid, text) from public;
revoke all on function public.publish_package_version(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text
) from public;

grant execute on function public.can_read_package_source(text)
  to anon, authenticated;
grant execute on function public.package_slug_available(text, uuid)
  to authenticated;
grant execute on function public.package_version_available(uuid, text)
  to authenticated;
grant execute on function public.publish_package_version(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text
) to authenticated;
