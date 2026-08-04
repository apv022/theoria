alter table public.profiles
  add column location text not null default '',
  add column website_url text not null default '';

alter table public.profiles
  add constraint profiles_location_length check (char_length(location) <= 120),
  add constraint profiles_website_length check (char_length(website_url) <= 500),
  add constraint profiles_website_scheme check (
    website_url = '' or website_url ~ '^https?://[^[:space:]]+$'
  );

grant update (location, website_url) on table public.profiles to authenticated;

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.id = old.id;
  new.created_at = old.created_at;
  new.handle = lower(trim(new.handle));
  new.display_name = trim(new.display_name);
  new.bio = trim(new.bio);
  new.avatar_path = nullif(trim(new.avatar_path), '');
  new.location = trim(new.location);
  new.website_url = trim(new.website_url);
  return new;
end;
$$;

alter table public.package_versions
  add column source_size bigint not null default 0,
  add constraint package_versions_source_size check (
    source_size between 0 and 52428800
  ),
  add constraint package_versions_unique_source unique (
    package_id, source_checksum
  );

alter table public.packages
  add column parent_package_id uuid,
  add column parent_version_id uuid,
  add constraint packages_lineage_pair check (
    (parent_package_id is null and parent_version_id is null)
    or (parent_package_id is not null and parent_version_id is not null)
  ),
  add constraint packages_not_own_parent check (
    parent_package_id is null or parent_package_id <> id
  ),
  add constraint packages_parent_repository foreign key (parent_package_id)
    references public.packages(id) on delete restrict,
  add constraint packages_parent_release foreign key (
    parent_version_id, parent_package_id
  ) references public.package_versions(id, package_id) on delete restrict;

create unique index packages_owner_source_fork_idx
  on public.packages (owner_id, parent_package_id, parent_version_id)
  where parent_package_id is not null;

create index packages_parent_network_idx
  on public.packages (parent_package_id, created_at desc)
  where parent_package_id is not null;

create or replace function public.protect_package_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'package ownership is immutable'
      using errcode = '55000';
  end if;
  if new.parent_package_id is distinct from old.parent_package_id
    or new.parent_version_id is distinct from old.parent_version_id then
    raise exception 'package fork lineage is immutable'
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

create table public.package_stars (
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, package_id)
);

create index package_stars_package_count_idx
  on public.package_stars (package_id, created_at desc);

alter table public.package_stars enable row level security;
revoke all on table public.package_stars from anon, authenticated;
grant select on table public.package_stars to authenticated;

create policy "Users read only their accessible stars"
  on public.package_stars
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.packages package
      where package.id = package_stars.package_id
        and (
          package.visibility in ('public', 'unlisted')
          or package.owner_id = (select auth.uid())
        )
    )
  );

create function public.set_package_star(
  requested_package_id uuid,
  requested_starred boolean
)
returns table (starred boolean, star_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.packages package
    where package.id = requested_package_id
      and (
        package.visibility in ('public', 'unlisted')
        or package.owner_id = caller_id
      )
  ) then
    raise exception 'package is unavailable' using errcode = '42501';
  end if;

  if coalesce(requested_starred, false) then
    insert into public.package_stars (user_id, package_id)
    values (caller_id, requested_package_id)
    on conflict (user_id, package_id) do nothing;
  else
    delete from public.package_stars star
    where star.user_id = caller_id
      and star.package_id = requested_package_id;
  end if;

  return query
  select
    exists (
      select 1 from public.package_stars star
      where star.user_id = caller_id
        and star.package_id = requested_package_id
    ),
    count(*)
  from public.package_stars star
  where star.package_id = requested_package_id;
end;
$$;

create function public.repository_package_network(requested_package_id uuid)
returns table (
  star_count bigint,
  fork_count bigint,
  viewer_starred boolean,
  parent_slug text,
  parent_title text,
  parent_version text,
  parent_creator_handle text,
  direct_forks jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select package.*
    from public.packages package
    where package.id = requested_package_id
      and (
        package.visibility in ('public', 'unlisted')
        or package.owner_id = auth.uid()
      )
  ),
  parent as (
    select
      package.slug,
      package.title,
      release.version,
      profile.handle
    from target
    join public.packages package on package.id = target.parent_package_id
    join public.package_versions release on release.id = target.parent_version_id
    join public.profiles profile on profile.id = package.owner_id
    where package.visibility in ('public', 'unlisted')
      or package.owner_id = auth.uid()
  ),
  forks as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slug', fork.slug,
          'title', fork.title,
          'creatorHandle', profile.handle,
          'createdAt', fork.created_at
        ) order by fork.created_at desc, fork.id
      ),
      '[]'::jsonb
    ) as values
    from target
    join public.packages fork on fork.parent_package_id = target.id
    join public.profiles profile on profile.id = fork.owner_id
    where fork.visibility = 'public'
  )
  select
    (select count(*) from public.package_stars star where star.package_id = target.id),
    (select count(*) from public.packages fork where fork.parent_package_id = target.id and fork.visibility = 'public'),
    exists (
      select 1 from public.package_stars star
      where star.package_id = target.id and star.user_id = auth.uid()
    ),
    parent.slug,
    parent.title,
    parent.version,
    parent.handle,
    forks.values
  from target
  left join parent on true
  cross join forks;
$$;

create function public.repository_starred_package_ids(
  requested_limit integer,
  requested_offset integer
)
returns table (package_id uuid, starred_at timestamptz, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select star.package_id, star.created_at, count(*) over ()
  from public.package_stars star
  join public.packages package on package.id = star.package_id
  where star.user_id = auth.uid()
    and (
      package.visibility in ('public', 'unlisted')
      or package.owner_id = auth.uid()
    )
  order by star.created_at desc, star.package_id
  limit least(greatest(coalesce(requested_limit, 12), 1), 24)
  offset greatest(coalesce(requested_offset, 0), 0);
$$;

create function public.profile_repository_summary(requested_handle text)
returns table (
  public_package_count bigint,
  total_version_count bigint,
  total_stars_received bigint,
  recent_activity jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with creator as (
    select profile.id
    from public.profiles profile
    where profile.handle = lower(trim(requested_handle))
  ),
  visible_packages as (
    select package.id, package.slug, package.title
    from public.packages package
    join creator on creator.id = package.owner_id
    where package.visibility = 'public'
  ),
  releases as (
    select
      package.id as package_id,
      package.slug,
      package.title,
      release.version,
      release.published_at
    from visible_packages package
    join public.package_versions release on release.package_id = package.id
  ),
  recent as (
    select * from releases
    order by published_at desc, package_id
    limit 8
  )
  select
    (select count(*) from visible_packages),
    (select count(*) from releases),
    (
      select count(*)
      from public.package_stars star
      join visible_packages package on package.id = star.package_id
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'slug', recent.slug,
            'title', recent.title,
            'version', recent.version,
            'publishedAt', recent.published_at
          ) order by recent.published_at desc, recent.package_id
        )
        from recent
      ),
      '[]'::jsonb
    )
  where exists (select 1 from creator);
$$;

revoke all on function public.set_package_star(uuid, boolean) from public;
revoke all on function public.repository_package_network(uuid) from public;
revoke all on function public.repository_starred_package_ids(integer, integer) from public;
revoke all on function public.profile_repository_summary(text) from public;

grant execute on function public.set_package_star(uuid, boolean) to authenticated;
grant execute on function public.repository_package_network(uuid) to anon, authenticated;
grant execute on function public.repository_starred_package_ids(integer, integer) to authenticated;
grant execute on function public.profile_repository_summary(text) to anon, authenticated;

drop function public.publish_package_version(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text
);

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
  requested_release_notes text,
  requested_source_size bigint,
  requested_parent_package_id uuid,
  requested_parent_version_id uuid
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
  current_version public.package_versions;
  normalized_slug text := lower(trim(requested_slug));
  expected_path text;
  requested_core integer[];
  current_core integer[];
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if requested_package_id is null then
    requested_package_id := gen_random_uuid();
  end if;
  if (requested_parent_package_id is null) <> (requested_parent_version_id is null) then
    raise exception 'fork lineage requires an exact package and version'
      using errcode = '22023';
  end if;
  if requested_source_size is null
    or requested_source_size < 0
    or requested_source_size > 52428800 then
    raise exception 'source archive size is invalid' using errcode = '22023';
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
    select 1 from storage.objects object
    where object.bucket_id = 'package-sources'
      and object.name = requested_source_storage_path
      and object.owner_id = caller_id::text
  ) then
    raise exception 'verified source upload is missing' using errcode = '22023';
  end if;

  select * into target_package
  from public.packages package
  where package.id = requested_package_id
  for update;

  if found then
    if target_package.owner_id <> caller_id then
      raise exception 'package belongs to another creator' using errcode = '42501';
    end if;
    if target_package.slug <> normalized_slug then
      raise exception 'published package slugs are stable' using errcode = '22023';
    end if;
    if target_package.parent_package_id is distinct from requested_parent_package_id
      or target_package.parent_version_id is distinct from requested_parent_version_id then
      raise exception 'published fork lineage cannot be changed' using errcode = '55000';
    end if;
    update public.packages package
    set title = requested_title,
        description = requested_description,
        visibility = requested_visibility
    where package.id = requested_package_id;
  else
    if not public.package_slug_available(normalized_slug, null) then
      raise exception 'package slug is unavailable' using errcode = '23505';
    end if;
    if requested_parent_package_id is not null and not exists (
      select 1
      from public.packages parent
      join public.package_versions release
        on release.id = requested_parent_version_id
       and release.package_id = parent.id
      where parent.id = requested_parent_package_id
        and (
          parent.visibility in ('public', 'unlisted')
          or parent.owner_id = caller_id
        )
    ) then
      raise exception 'fork source is unavailable' using errcode = '42501';
    end if;
    insert into public.packages (
      id, owner_id, slug, title, description, visibility,
      parent_package_id, parent_version_id
    ) values (
      requested_package_id, caller_id, normalized_slug,
      trim(requested_title), trim(requested_description), requested_visibility,
      requested_parent_package_id, requested_parent_version_id
    ) returning * into target_package;
  end if;

  select * into target_version
  from public.package_versions release
  where release.package_id = requested_package_id
    and release.version = requested_version;
  if found then
    if target_version.source_checksum = requested_source_checksum
      and target_version.source_storage_path = requested_source_storage_path
      and target_version.source_size = requested_source_size
      and target_version.mcf_version::text = requested_mcf_version
      and target_version.package_kind::text = requested_package_kind
      and target_version.manifest_summary = requested_manifest_summary
      and target_version.validation_summary = requested_validation_summary
      and target_version.release_notes = trim(requested_release_notes) then
      return query select
        requested_package_id,
        target_version.id,
        normalized_slug,
        target_version.version,
        target_version.published_at;
      return;
    end if;
    raise exception 'package version already exists with different content'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from public.package_versions release
    where release.package_id = requested_package_id
      and release.source_checksum = requested_source_checksum
  ) then
    raise exception 'these source bytes are already published'
      using errcode = '23505';
  end if;

  if target_package.latest_version_id is not null then
    select * into current_version
    from public.package_versions release
    where release.id = target_package.latest_version_id;
    requested_core := string_to_array(
      split_part(split_part(requested_version, '-', 1), '+', 1),
      '.'
    )::integer[];
    current_core := string_to_array(
      split_part(split_part(current_version.version, '-', 1), '+', 1),
      '.'
    )::integer[];
    if requested_core < current_core
      or (
        requested_core = current_core
        and position('-' in current_version.version) = 0
      ) then
      raise exception 'package version cannot move backward'
        using errcode = '22023';
    end if;
  end if;

  insert into public.package_versions (
    package_id, version, mcf_version, package_kind, source_storage_path,
    source_checksum, source_size, manifest_summary, validation_summary,
    release_notes
  ) values (
    requested_package_id, requested_version, requested_mcf_version,
    requested_package_kind, requested_source_storage_path,
    requested_source_checksum, requested_source_size,
    requested_manifest_summary, requested_validation_summary,
    trim(requested_release_notes)
  ) returning * into target_version;

  update public.packages package
  set latest_version_id = target_version.id
  where package.id = requested_package_id;

  return query select
    requested_package_id,
    target_version.id,
    normalized_slug,
    target_version.version,
    target_version.published_at;
end;
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
language sql
security definer
set search_path = ''
as $$
  select * from public.publish_package_version(
    requested_package_id,
    requested_slug,
    requested_title,
    requested_description,
    requested_visibility,
    requested_version,
    requested_mcf_version,
    requested_package_kind,
    requested_source_storage_path,
    requested_source_checksum,
    requested_manifest_summary,
    requested_validation_summary,
    requested_release_notes,
    0,
    null,
    null
  );
$$;

revoke all on function public.publish_package_version(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, text, bigint, uuid, uuid
) from public;
revoke all on function public.publish_package_version(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, text
) from public;

grant execute on function public.publish_package_version(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, text, bigint, uuid, uuid
) to authenticated;
grant execute on function public.publish_package_version(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, text
) to authenticated;
