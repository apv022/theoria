create extension if not exists pg_trgm with schema extensions;

create index packages_repository_text_idx
  on public.packages using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || slug
    )
  );

create index package_versions_manifest_search_idx
  on public.package_versions using gin (
    to_tsvector(
      'simple',
      coalesce(manifest_summary ->> 'subjects', '') || ' '
      || coalesce(manifest_summary ->> 'keywords', '') || ' '
      || coalesce(manifest_summary ->> 'level', '') || ' '
      || coalesce(manifest_summary ->> 'learningOutcomes', '') || ' '
      || coalesce(manifest_summary ->> 'learning_outcomes', '')
    )
  );

create index profiles_repository_text_idx
  on public.profiles using gin (
    to_tsvector(
      'simple',
      coalesce(handle, '') || ' ' || coalesce(display_name, '')
    )
  );

create index packages_title_trgm_idx
  on public.packages using gin (title extensions.gin_trgm_ops);
create index packages_slug_trgm_idx
  on public.packages using gin (slug extensions.gin_trgm_ops);
create index profiles_handle_trgm_idx
  on public.profiles using gin (handle extensions.gin_trgm_ops);
create index packages_public_listing_idx
  on public.packages (updated_at desc, id)
  where visibility = 'public';
create index package_versions_published_idx
  on public.package_versions (published_at desc, id);

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
            || coalesce(
              release.manifest_summary ->> 'learningOutcomes',
              ''
            ) || ' '
            || coalesce(
              release.manifest_summary ->> 'learning_outcomes',
              ''
            )
          ),
          'C'
        ),
        websearch_to_tsquery('simple', trim(coalesce(requested_query, '')))
      ) as search_rank
    from public.packages package
    join public.profiles profile on profile.id = package.owner_id
    join public.package_versions release
      on release.id = package.latest_version_id
    where package.visibility = 'public'
      and (
        coalesce(trim(requested_profile_handle), '') = ''
        or profile.handle = lower(trim(requested_profile_handle))
      )
      and (
        coalesce(trim(requested_subject), '') = ''
        or exists (
          select 1
          from jsonb_array_elements_text(
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
        or lower(
          coalesce(
            release.manifest_summary -> 'level' ->> 'identifier',
            release.manifest_summary -> 'level' ->> 'label',
            release.manifest_summary ->> 'level',
            ''
          )
        ) = lower(trim(requested_level))
      )
      and (
        coalesce(trim(requested_language), '') = ''
        or lower(release.manifest_summary ->> 'language')
          = lower(trim(requested_language))
      )
      and (
        coalesce(trim(requested_kind), '') = ''
        or release.package_kind = requested_kind
      )
      and (
        coalesce(trim(requested_mcf_version), '') = ''
        or release.mcf_version = requested_mcf_version
      )
      and (
        coalesce(trim(requested_query), '') = ''
        or to_tsvector(
          'simple',
          coalesce(package.title, '') || ' '
          || coalesce(package.description, '') || ' '
          || package.slug
        ) @@ websearch_to_tsquery(
          'simple',
          trim(coalesce(requested_query, ''))
        )
        or to_tsvector(
          'simple',
          coalesce(profile.handle, '') || ' '
          || coalesce(profile.display_name, '')
        ) @@ websearch_to_tsquery(
          'simple',
          trim(coalesce(requested_query, ''))
        )
        or to_tsvector(
          'simple',
          coalesce(release.manifest_summary ->> 'subjects', '') || ' '
          || coalesce(release.manifest_summary ->> 'keywords', '') || ' '
          || coalesce(release.manifest_summary ->> 'level', '') || ' '
          || coalesce(
            release.manifest_summary ->> 'learningOutcomes',
            ''
          ) || ' '
          || coalesce(
            release.manifest_summary ->> 'learning_outcomes',
            ''
          )
        ) @@ websearch_to_tsquery(
          'simple',
          trim(coalesce(requested_query, ''))
        )
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
    counted.package_id,
    counted.owner_id,
    counted.slug,
    counted.title,
    counted.description,
    counted.visibility,
    counted.latest_version_id,
    counted.package_created_at,
    counted.package_updated_at,
    counted.profile_id,
    counted.creator_handle,
    counted.creator_display_name,
    counted.creator_bio,
    counted.creator_avatar_path,
    counted.creator_created_at,
    counted.creator_updated_at,
    counted.version_id,
    counted.version,
    counted.mcf_version,
    counted.package_kind,
    counted.source_storage_path,
    counted.source_checksum,
    counted.manifest_summary,
    counted.validation_summary,
    counted.release_notes,
    counted.published_at,
    counted.total_count
  from counted
  order by
    case
      when requested_sort = 'relevance'
        and coalesce(trim(requested_query), '') <> ''
        then counted.search_rank
    end desc,
    case
      when requested_sort in ('relevance', 'newest')
        then counted.published_at
    end desc,
    case
      when requested_sort = 'updated'
        then counted.package_updated_at
    end desc,
    case
      when requested_sort = 'title'
        then lower(counted.title)
    end asc,
    lower(counted.title) asc,
    counted.package_id asc
  limit least(greatest(coalesce(requested_limit, 12), 1), 24)
  offset greatest(coalesce(requested_offset, 0), 0);
$$;

create function public.repository_subjects(requested_limit integer)
returns table (
  subject text,
  package_count bigint
)
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
  where package.visibility = 'public'
    and trim(subject.value) <> ''
  group by lower(subject.value)
  order by count(distinct package.id) desc, lower(subject.value)
  limit least(greatest(coalesce(requested_limit, 8), 1), 24);
$$;

revoke all on function public.repository_packages(
  text, text, text, text, text, text, text, text, integer, integer
) from public;
revoke all on function public.repository_subjects(integer) from public;

grant execute on function public.repository_packages(
  text, text, text, text, text, text, text, text, integer, integer
) to anon, authenticated;
grant execute on function public.repository_subjects(integer)
  to anon, authenticated;
