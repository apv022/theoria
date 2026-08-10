-- Repository deletion is a reversible product tombstone. Published versions,
-- stars, lineage, and source objects remain available to controlled internal
-- operations; normal product reads treat the repository as unavailable.
alter table public.packages
  add column deleted_at timestamptz;

comment on column public.packages.deleted_at is
  'Repository tombstone. NULL means active; published history and source archives are retained.';

create index packages_active_listing_idx
  on public.packages (updated_at desc, id)
  where deleted_at is null;

drop policy if exists "Visible packages or owner can read" on public.packages;
create policy "Visible packages or owner can read"
  on public.packages
  for select
  to anon, authenticated
  using (
    deleted_at is null
    and (
      visibility in ('public', 'unlisted')
      or owner_id = (select auth.uid())
    )
  );

drop policy if exists "Visible package versions or owner can read"
  on public.package_versions;
create policy "Visible package versions or owner can read"
  on public.package_versions
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.packages package
      where package.id = package_versions.package_id
        and package.deleted_at is null
        and (
          package.visibility in ('public', 'unlisted')
          or package.owner_id = (select auth.uid())
        )
    )
  );

create or replace function public.prevent_deleted_package_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'deleted repositories cannot be changed'
      using errcode = '55000';
  end if;
  if new.deleted_at is not null and (
    new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.slug is distinct from old.slug
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.visibility is distinct from old.visibility
    or new.latest_version_id is distinct from old.latest_version_id
    or new.parent_package_id is distinct from old.parent_package_id
    or new.parent_version_id is distinct from old.parent_version_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'repository deletion may only set deleted_at'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger prevent_deleted_package_mutation
  before update on public.packages
  for each row execute function public.prevent_deleted_package_mutation();

create or replace function public.prevent_deleted_version_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.packages package
    where package.id = new.package_id and package.deleted_at is not null
  ) then
    raise exception 'deleted repositories cannot receive new versions'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger prevent_deleted_version_insert
  before insert on public.package_versions
  for each row execute function public.prevent_deleted_version_insert();

create or replace function public.prevent_deleted_parent_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_package_id is not null and exists (
    select 1 from public.packages parent
    where parent.id = new.parent_package_id and parent.deleted_at is not null
  ) then
    raise exception 'fork source is unavailable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger prevent_deleted_parent_reference
  before insert on public.packages
  for each row execute function public.prevent_deleted_parent_reference();

create or replace function public.package_version_available(
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
    select 1 from public.packages package
    where package.id = candidate_package_id
      and package.owner_id = auth.uid()
      and package.deleted_at is null
  )
  and not exists (
    select 1 from public.package_versions version
    where version.package_id = candidate_package_id
      and version.version = candidate_version
  );
$$;

create or replace function public.package_slug_available(
  candidate text,
  existing_package_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(trim(candidate)) ~ '^[a-z][a-z0-9-]{2,62}$'
    and not exists (
      select 1
      from public.packages package
      where package.slug = lower(trim(candidate))
        and not (
          package.id = existing_package_id
          and package.owner_id = auth.uid()
          and package.deleted_at is null
        )
    );
$$;

create or replace function public.soft_delete_package(requested_package_id uuid)
returns table (package_id uuid, deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target public.packages;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select package.* into target
  from public.packages package
  where package.id = requested_package_id
  for update;

  if not found or target.owner_id <> caller_id then
    raise exception 'repository is unavailable' using errcode = '42501';
  end if;

  if target.deleted_at is null then
    update public.packages package
    set deleted_at = now()
    where package.id = target.id
    returning package.* into target;
  end if;

  return query select target.id, target.deleted_at;
end;
$$;

revoke all on function public.soft_delete_package(uuid)
  from public, anon, authenticated;
grant execute on function public.soft_delete_package(uuid) to authenticated;

-- Storage objects are retained, but deleted repositories are no longer
-- downloadable through the product's normal source endpoint.
create or replace function public.can_read_package_source(object_name text)
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
      and package.deleted_at is null
      and (
        package.visibility in ('public', 'unlisted')
        or package.owner_id = auth.uid()
      )
  );
$$;

drop policy if exists "Authorized package source downloads" on storage.objects;
create policy "Authorized package source downloads"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'package-sources'
    and public.can_read_package_source(name)
  );

drop policy if exists "Owners read their package source uploads" on storage.objects;
create policy "Owners read their package source uploads"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'package-sources'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'packages'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.can_read_package_source(name)
  );

-- Keep the original search function as a security-definer implementation and
-- expose a same-signature wrapper that removes tombstoned package ids.
alter function public.repository_packages(
  text, text, text, text, text, text, text, text, integer, integer
) rename to repository_packages_including_deleted;

create function public.repository_packages(
  requested_query text,
  requested_subject text,
  requested_level text,
  requested_language text,
  requested_kind text,
  requested_mcf_version text,
  requested_sort text,
  requested_profile_handle text,
  requested_limit integer,
  requested_offset integer
)
returns table (
  package_id uuid,
  owner_id uuid,
  slug text,
  title text,
  description text,
  visibility text,
  latest_version_id uuid,
  package_created_at timestamptz,
  package_updated_at timestamptz,
  profile_id uuid,
  creator_handle text,
  creator_display_name text,
  creator_bio text,
  creator_avatar_path text,
  creator_created_at timestamptz,
  creator_updated_at timestamptz,
  version_id uuid,
  version text,
  mcf_version text,
  package_kind text,
  source_storage_path text,
  source_checksum text,
  manifest_summary jsonb,
  validation_summary jsonb,
  release_notes text,
  published_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with searchable as (
    select
      package.id as package_id,
      package.owner_id,
      package.slug,
      package.title,
      package.description,
      package.visibility,
      package.latest_version_id,
      package.created_at as package_created_at,
      package.updated_at as package_updated_at,
      profile.id as profile_id,
      profile.handle as creator_handle,
      profile.display_name as creator_display_name,
      profile.bio as creator_bio,
      profile.avatar_path as creator_avatar_path,
      profile.created_at as creator_created_at,
      profile.updated_at as creator_updated_at,
      release.id as version_id,
      release.version,
      release.mcf_version,
      release.package_kind,
      release.source_storage_path,
      release.source_checksum,
      release.manifest_summary,
      release.validation_summary,
      release.release_notes,
      release.published_at,
      ts_rank(
        setweight(
          to_tsvector(
            'simple',
            coalesce(package.title, '') || ' ' || coalesce(package.slug, '')
          ),
          'A'
        )
        || setweight(
          to_tsvector(
            'simple',
            coalesce(package.description, '') || ' '
            || coalesce(profile.handle, '') || ' '
            || coalesce(profile.display_name, '')
          ),
          'B'
        )
        || setweight(
          to_tsvector(
            'simple',
            coalesce(release.manifest_summary ->> 'subjects', '') || ' '
            || coalesce(release.manifest_summary ->> 'keywords', '') || ' '
            || coalesce(release.manifest_summary ->> 'level', '') || ' '
            || coalesce(release.manifest_summary ->> 'learningOutcomes', '') || ' '
            || coalesce(release.manifest_summary ->> 'learning_outcomes', '')
          ),
          'C'
        ),
        websearch_to_tsquery('simple', trim(coalesce(requested_query, '')))
      ) as search_rank
    from public.packages package
    join public.profiles profile on profile.id = package.owner_id
    join public.package_versions release on release.id = package.latest_version_id
    where package.deleted_at is null
      and package.visibility = 'public'
      and (
        coalesce(trim(requested_profile_handle), '') = ''
        or profile.handle = lower(trim(requested_profile_handle))
      )
      and (
        coalesce(trim(requested_subject), '') = ''
        or exists (
          select 1 from jsonb_array_elements_text(
            case
              when jsonb_typeof(release.manifest_summary -> 'subjects') = 'array'
                then release.manifest_summary -> 'subjects'
              else '[]'::jsonb
            end
          ) subject(value)
          where lower(subject.value) = lower(trim(requested_subject))
        )
      )
      and (
        coalesce(trim(requested_level), '') = ''
        or lower(coalesce(
          release.manifest_summary -> 'level' ->> 'identifier',
          release.manifest_summary -> 'level' ->> 'label',
          release.manifest_summary ->> 'level', ''
        )) = lower(trim(requested_level))
      )
      and (
        coalesce(trim(requested_language), '') = ''
        or lower(release.manifest_summary ->> 'language')
          = lower(trim(requested_language))
      )
      and (coalesce(trim(requested_kind), '') = ''
        or release.package_kind = requested_kind)
      and (coalesce(trim(requested_mcf_version), '') = ''
        or release.mcf_version = requested_mcf_version)
      and (
        coalesce(trim(requested_query), '') = ''
        or to_tsvector('simple', coalesce(package.title, '') || ' '
          || coalesce(package.description, '') || ' ' || package.slug)
          @@ websearch_to_tsquery('simple', trim(coalesce(requested_query, '')))
        or to_tsvector('simple', coalesce(profile.handle, '') || ' '
          || coalesce(profile.display_name, ''))
          @@ websearch_to_tsquery('simple', trim(coalesce(requested_query, '')))
        or to_tsvector('simple', coalesce(release.manifest_summary ->> 'subjects', '')
          || ' ' || coalesce(release.manifest_summary ->> 'keywords', '')
          || ' ' || coalesce(release.manifest_summary ->> 'level', '')
          || ' ' || coalesce(release.manifest_summary ->> 'learningOutcomes', '')
          || ' ' || coalesce(release.manifest_summary ->> 'learning_outcomes', ''))
          @@ websearch_to_tsquery('simple', trim(coalesce(requested_query, '')))
        or package.title ilike '%' || trim(requested_query) || '%'
        or package.slug ilike '%' || trim(requested_query) || '%'
        or profile.handle ilike '%' || trim(requested_query) || '%'
        or profile.display_name ilike '%' || trim(requested_query) || '%'
      )
  ),
  counted as (
    select searchable.*, count(*) over () as total_count
    from searchable
  )
  select
    counted.package_id, counted.owner_id, counted.slug, counted.title,
    counted.description, counted.visibility, counted.latest_version_id,
    counted.package_created_at, counted.package_updated_at, counted.profile_id,
    counted.creator_handle, counted.creator_display_name, counted.creator_bio,
    counted.creator_avatar_path, counted.creator_created_at,
    counted.creator_updated_at, counted.version_id, counted.version,
    counted.mcf_version, counted.package_kind, counted.source_storage_path,
    counted.source_checksum, counted.manifest_summary,
    counted.validation_summary, counted.release_notes, counted.published_at,
    counted.total_count
  from counted
  order by
    case when requested_sort = 'relevance'
      and coalesce(trim(requested_query), '') <> '' then counted.search_rank end desc,
    case when requested_sort in ('relevance', 'newest')
      then counted.published_at end desc,
    case when requested_sort = 'updated'
      then counted.package_updated_at end desc,
    case when requested_sort = 'title' then lower(counted.title) end asc,
    lower(counted.title) asc,
    counted.package_id asc
  limit least(greatest(coalesce(requested_limit, 12), 1), 24)
  offset greatest(coalesce(requested_offset, 0), 0);
$$;

revoke all on function public.repository_packages_including_deleted(
  text, text, text, text, text, text, text, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.repository_packages(
  text, text, text, text, text, text, text, text, integer, integer
) from public;
grant execute on function public.repository_packages(
  text, text, text, text, text, text, text, text, integer, integer
) to anon, authenticated;

create or replace function public.repository_subjects(requested_limit integer)
returns table (subject text, package_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(subject.value), count(distinct package.id)
  from public.packages package
  join public.package_versions release
    on release.id = package.latest_version_id
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(release.manifest_summary -> 'subjects') = 'array'
        then release.manifest_summary -> 'subjects'
      else '[]'::jsonb
    end
  ) subject(value)
  where package.deleted_at is null
    and package.visibility = 'public'
    and trim(subject.value) <> ''
  group by lower(subject.value)
  order by count(distinct package.id) desc, lower(subject.value)
  limit least(greatest(coalesce(requested_limit, 8), 1), 24);
$$;

revoke all on function public.repository_subjects(integer) from public;
grant execute on function public.repository_subjects(integer) to anon, authenticated;

create or replace function public.repository_package_network(requested_package_id uuid)
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
      and package.deleted_at is null
      and (
        package.visibility in ('public', 'unlisted')
        or package.owner_id = auth.uid()
      )
  ),
  parent as (
    select package.slug, package.title, release.version, profile.handle
    from target
    join public.packages package on package.id = target.parent_package_id
      and package.deleted_at is null
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
      ), '[]'::jsonb
    ) as values
    from target
    join public.packages fork
      on fork.parent_package_id = target.id
      and fork.deleted_at is null
    join public.profiles profile on profile.id = fork.owner_id
    where fork.visibility = 'public'
  )
  select
    (select count(*) from public.package_stars star
      where star.package_id = target.id),
    (select count(*) from public.packages fork
      where fork.parent_package_id = target.id
        and fork.deleted_at is null
        and fork.visibility = 'public'),
    exists (select 1 from public.package_stars star
      where star.package_id = target.id and star.user_id = auth.uid()),
    parent.slug, parent.title, parent.version, parent.handle, forks.values
  from target
  left join parent on true
  cross join forks;
$$;

create or replace function public.set_package_star(
  requested_package_id uuid,
  requested_starred boolean
)
returns table (starred boolean, star_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.packages package
    where package.id = requested_package_id
      and package.deleted_at is null
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
    where star.user_id = caller_id and star.package_id = requested_package_id;
  end if;
  return query
  select exists (
    select 1 from public.package_stars star
    where star.user_id = caller_id and star.package_id = requested_package_id
  ), count(*)
  from public.package_stars star
  where star.package_id = requested_package_id;
end;
$$;

drop policy if exists "Users read only their accessible stars" on public.package_stars;
create policy "Users read only their accessible stars"
  on public.package_stars
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.packages package
      where package.id = package_stars.package_id
        and package.deleted_at is null
        and (
          package.visibility in ('public', 'unlisted')
          or package.owner_id = (select auth.uid())
        )
    )
  );

alter function public.repository_starred_package_ids(integer, integer)
  rename to repository_starred_package_ids_including_deleted;

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
    and package.deleted_at is null
    and (
      package.visibility in ('public', 'unlisted')
      or package.owner_id = auth.uid()
    )
  order by star.created_at desc, star.package_id
  limit least(greatest(coalesce(requested_limit, 12), 1), 24)
  offset greatest(coalesce(requested_offset, 0), 0);
$$;

revoke all on function public.repository_starred_package_ids_including_deleted(
  integer, integer
) from public, anon, authenticated;
revoke all on function public.repository_starred_package_ids(integer, integer)
  from public;
grant execute on function public.repository_starred_package_ids(integer, integer)
  to authenticated;

create or replace function public.profile_repository_summary(requested_handle text)
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
    select profile.id from public.profiles profile
    where profile.handle = lower(trim(requested_handle))
  ),
  visible_packages as (
    select package.id, package.slug, package.title
    from public.packages package join creator on creator.id = package.owner_id
    where package.deleted_at is null and package.visibility = 'public'
  ),
  releases as (
    select package.id as package_id, package.slug, package.title,
      release.version, release.published_at
    from visible_packages package
    join public.package_versions release on release.package_id = package.id
  ),
  recent as (
    select * from releases order by published_at desc, package_id limit 8
  )
  select
    (select count(*) from visible_packages),
    (select count(*) from releases),
    (select count(*) from public.package_stars star
      join visible_packages package on package.id = star.package_id),
    coalesce((select jsonb_agg(jsonb_build_object(
      'slug', recent.slug, 'title', recent.title, 'version', recent.version,
      'publishedAt', recent.published_at
    ) order by recent.published_at desc, recent.package_id) from recent), '[]'::jsonb)
  where exists (select 1 from creator);
$$;

revoke all on function public.set_package_star(uuid, boolean) from public;
revoke all on function public.repository_package_network(uuid) from public;
revoke all on function public.profile_repository_summary(text) from public;
grant execute on function public.set_package_star(uuid, boolean) to authenticated;
grant execute on function public.repository_package_network(uuid) to anon, authenticated;
grant execute on function public.profile_repository_summary(text) to anon, authenticated;
