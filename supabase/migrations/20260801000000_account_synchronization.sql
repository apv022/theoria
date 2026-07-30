create sequence public.sync_cursor_sequence;

create table public.sync_devices (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null,
  device_name text not null default 'Browser device',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (owner_id, device_id),
  constraint sync_devices_name_length check (
    char_length(trim(device_name)) between 1 and 120
  )
);

create table public.sync_records (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  stable_id text not null,
  schema_version integer not null default 1,
  revision integer not null,
  reset_generation integer not null default 0,
  source_checksum text,
  payload jsonb not null default '{}'::jsonb,
  artifact_status text not null default 'available',
  deleted boolean not null default false,
  updated_by_device_id uuid not null,
  last_operation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_cursor bigint not null default nextval(
    'public.sync_cursor_sequence'::regclass
  ),
  primary key (owner_id, category, stable_id),
  unique (owner_id, last_operation_id),
  constraint sync_records_category check (
    category in ('draft', 'progress', 'library', 'local_package', 'compilation')
  ),
  constraint sync_records_stable_id_length check (
    char_length(stable_id) between 1 and 500
  ),
  constraint sync_records_revision_positive check (revision > 0),
  constraint sync_records_reset_generation_valid check (reset_generation >= 0),
  constraint sync_records_checksum check (
    source_checksum is null or source_checksum ~ '^[0-9a-f]{64}$'
  ),
  constraint sync_records_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint sync_records_artifact_status check (
    artifact_status in ('available', 'metadata_only', 'unavailable')
  ),
  constraint sync_records_device_owner foreign key (
    owner_id, updated_by_device_id
  ) references public.sync_devices(owner_id, device_id) on delete restrict
);

create index sync_records_pull_idx
  on public.sync_records (owner_id, sync_cursor, category, stable_id);
create index sync_records_active_category_idx
  on public.sync_records (owner_id, category, updated_at desc)
  where deleted = false;

create table public.sync_blobs (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  checksum text not null,
  blob_kind text not null,
  storage_path text not null unique,
  byte_size bigint not null,
  content_type text not null default 'application/octet-stream',
  created_at timestamptz not null default now(),
  primary key (owner_id, checksum),
  constraint sync_blobs_checksum check (checksum ~ '^[0-9a-f]{64}$'),
  constraint sync_blobs_kind check (
    blob_kind in ('draft', 'local_package', 'source', 'compiled', 'record_binary')
  ),
  constraint sync_blobs_size check (byte_size between 0 and 52428800),
  constraint sync_blobs_path check (
    storage_path ~ '^users/[0-9a-f-]{36}/(draft|local_package|source|compiled|record_binary)/[0-9a-f]{64}$'
    and storage_path =
      'users/' || owner_id::text || '/' || blob_kind || '/' || checksum
  )
);

comment on table public.sync_records is
  'Private account recovery records. IndexedDB remains the immediate working state.';
comment on table public.sync_blobs is
  'Owner-scoped immutable blob registry for synchronized local data.';

alter table public.sync_devices enable row level security;
alter table public.sync_records enable row level security;
alter table public.sync_blobs enable row level security;

revoke all on table public.sync_devices from anon, authenticated;
revoke all on table public.sync_records from anon, authenticated;
revoke all on table public.sync_blobs from anon, authenticated;
grant select on table public.sync_devices to authenticated;
grant select on table public.sync_records to authenticated;
grant select on table public.sync_blobs to authenticated;

create policy "Owners read sync devices"
  on public.sync_devices for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners read sync records"
  on public.sync_records for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners read sync blobs"
  on public.sync_blobs for select to authenticated
  using (owner_id = (select auth.uid()));

create function public.sync_touch_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id = old.owner_id;
  new.category = old.category;
  new.stable_id = old.stable_id;
  new.created_at = old.created_at;
  new.updated_at = now();
  new.sync_cursor = nextval('public.sync_cursor_sequence'::regclass);
  return new;
end;
$$;

create trigger sync_records_touch
  before update on public.sync_records
  for each row execute function public.sync_touch_record();

create function public.sync_register_device(
  requested_device_id uuid,
  requested_device_name text,
  requested_enabled boolean
)
returns public.sync_devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  result public.sync_devices;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.sync_devices (
    owner_id, device_id, device_name, enabled, last_seen_at
  )
  values (
    caller_id,
    requested_device_id,
    trim(coalesce(requested_device_name, 'Browser device')),
    requested_enabled,
    now()
  )
  on conflict (owner_id, device_id) do update
  set
    device_name = excluded.device_name,
    enabled = excluded.enabled,
    last_seen_at = now()
  returning * into result;
  return result;
end;
$$;

create function public.sync_apply_record(
  requested_category text,
  requested_stable_id text,
  requested_expected_revision integer,
  requested_schema_version integer,
  requested_reset_generation integer,
  requested_source_checksum text,
  requested_payload jsonb,
  requested_artifact_status text,
  requested_deleted boolean,
  requested_device_id uuid,
  requested_operation_id text
)
returns public.sync_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_record public.sync_records;
  result public.sync_records;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.sync_devices device
    where device.owner_id = caller_id
      and device.device_id = requested_device_id
      and device.enabled
  ) then
    raise exception 'sync is not enabled for this device'
      using errcode = '42501';
  end if;

  select * into current_record
  from public.sync_records record
  where record.owner_id = caller_id
    and record.category = requested_category
    and record.stable_id = requested_stable_id
  for update;

  if found and current_record.last_operation_id = requested_operation_id then
    return current_record;
  end if;
  if (not found and coalesce(requested_expected_revision, 0) <> 0)
    or (found and current_record.revision <> requested_expected_revision) then
    raise exception 'remote revision conflict'
      using errcode = '40001';
  end if;
  if found
    and requested_category = 'progress'
    and coalesce(requested_reset_generation, 0) < current_record.reset_generation
  then
    raise exception 'progress reset generation cannot decrease'
      using errcode = '22023';
  end if;

  insert into public.sync_records (
    owner_id,
    category,
    stable_id,
    schema_version,
    revision,
    reset_generation,
    source_checksum,
    payload,
    artifact_status,
    deleted,
    updated_by_device_id,
    last_operation_id
  )
  values (
    caller_id,
    requested_category,
    requested_stable_id,
    greatest(coalesce(requested_schema_version, 1), 1),
    coalesce(requested_expected_revision, 0) + 1,
    greatest(coalesce(requested_reset_generation, 0), 0),
    requested_source_checksum,
    coalesce(requested_payload, '{}'::jsonb),
    requested_artifact_status,
    coalesce(requested_deleted, false),
    requested_device_id,
    requested_operation_id
  )
  on conflict (owner_id, category, stable_id) do update
  set
    schema_version = excluded.schema_version,
    revision = excluded.revision,
    reset_generation = excluded.reset_generation,
    source_checksum = excluded.source_checksum,
    payload = excluded.payload,
    artifact_status = excluded.artifact_status,
    deleted = excluded.deleted,
    updated_by_device_id = excluded.updated_by_device_id,
    last_operation_id = excluded.last_operation_id
  returning * into result;
  return result;
end;
$$;

create function public.sync_register_blob(
  requested_checksum text,
  requested_blob_kind text,
  requested_storage_path text,
  requested_byte_size bigint,
  requested_content_type text
)
returns public.sync_blobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  expected_path text;
  result public.sync_blobs;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  expected_path :=
    'users/' || caller_id::text || '/' || requested_blob_kind || '/'
    || requested_checksum;
  if requested_storage_path <> expected_path then
    raise exception 'invalid private sync blob path' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'account-sync'
      and object.name = requested_storage_path
      and object.owner_id = caller_id
  ) then
    raise exception 'private sync blob upload is missing'
      using errcode = '22023';
  end if;
  insert into public.sync_blobs (
    owner_id, checksum, blob_kind, storage_path, byte_size, content_type
  )
  values (
    caller_id,
    requested_checksum,
    requested_blob_kind,
    requested_storage_path,
    requested_byte_size,
    coalesce(nullif(requested_content_type, ''), 'application/octet-stream')
  )
  on conflict (owner_id, checksum) do nothing;
  select * into result
  from public.sync_blobs blob
  where blob.owner_id = caller_id
    and blob.checksum = requested_checksum;
  return result;
end;
$$;

revoke all on function public.sync_register_device(uuid, text, boolean)
  from public;
revoke all on function public.sync_apply_record(
  text, text, integer, integer, integer, text, jsonb, text, boolean, uuid, text
) from public;
revoke all on function public.sync_register_blob(text, text, text, bigint, text)
  from public;
grant execute on function public.sync_register_device(uuid, text, boolean)
  to authenticated;
grant execute on function public.sync_apply_record(
  text, text, integer, integer, integer, text, jsonb, text, boolean, uuid, text
) to authenticated;
grant execute on function public.sync_register_blob(
  text, text, text, bigint, text
) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('account-sync', 'account-sync', false, 52428800)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit;

create policy "Owners read registered sync blobs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'account-sync'
    and owner_id = (select auth.uid())
    and exists (
      select 1 from public.sync_blobs blob
      where blob.owner_id = (select auth.uid())
        and blob.storage_path = name
    )
  );

create policy "Owners upload immutable sync blobs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'account-sync'
    and owner_id = (select auth.uid())
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] in (
      'draft', 'local_package', 'source', 'compiled', 'record_binary'
    )
    and name ~ '^users/[0-9a-f-]{36}/(draft|local_package|source|compiled|record_binary)/[0-9a-f]{64}$'
  );
