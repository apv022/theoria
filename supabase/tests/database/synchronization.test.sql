begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

select has_table('public', 'sync_devices', 'sync device table exists');
select has_table('public', 'sync_records', 'sync record table exists');
select has_table('public', 'sync_blobs', 'sync blob registry exists');
select has_pk('public', 'sync_devices', 'sync devices have an owner-scoped key');
select has_pk('public', 'sync_records', 'sync records have an owner-scoped key');
select has_pk('public', 'sync_blobs', 'sync blobs deduplicate per owner');
select policies_are(
  'public',
  'sync_devices',
  array['Owners read sync devices'],
  'device metadata is owner-readable only'
);
select policies_are(
  'public',
  'sync_records',
  array['Owners read sync records'],
  'synchronized records are owner-readable only'
);
select policies_are(
  'public',
  'sync_blobs',
  array['Owners read sync blobs'],
  'private blob metadata is owner-readable only'
);
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'account-sync'
      and not public
      and file_size_limit = 52428800
  ),
  'account sync storage is private and bounded'
);
select has_function(
  'public',
  'sync_register_device',
  array['uuid', 'text', 'boolean'],
  'device registration function exists'
);
select has_function(
  'public',
  'sync_apply_record',
  array[
    'text', 'text', 'integer', 'integer', 'integer', 'text',
    'jsonb', 'text', 'boolean', 'uuid', 'text'
  ],
  'revision-checked record function exists'
);
select has_function(
  'public',
  'sync_register_blob',
  array['text', 'text', 'text', 'bigint', 'text'],
  'immutable blob registration function exists'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'sync-one@example.test',
    '{"handle":"sync_one","display_name":"Sync One"}'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'sync-two@example.test',
    '{"handle":"sync_two","display_name":"Sync Two"}'
  );

set local role anon;
select is_empty(
  'select stable_id from public.sync_records',
  'anonymous users cannot read synchronized records'
);
select is_empty(
  'select checksum from public.sync_blobs',
  'anonymous users cannot read private blob metadata'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'account-sync',
      'users/20000000-0000-4000-8000-000000000002/draft/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '10000000-0000-4000-8000-000000000001',
      '{"mimetype":"application/zip","size":10}'
    )$$,
  '42501',
  null,
  'a browser cannot upload into another owner path'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'account-sync',
  'users/10000000-0000-4000-8000-000000000001/draft/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '10000000-0000-4000-8000-000000000001',
  '{"mimetype":"application/zip","size":10}'
);

select lives_ok(
  $$select public.sync_register_blob(
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'draft',
    'users/10000000-0000-4000-8000-000000000001/draft/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    10,
    'application/zip'
  )$$,
  'an owner can register an uploaded checksum-addressed blob'
);
select lives_ok(
  $$select public.sync_register_device(
    'aaaaaaaa-0000-4000-8000-000000000001',
    'Test browser',
    true
  )$$,
  'sync must be explicitly enabled for a device'
);
select lives_ok(
  $$select public.sync_apply_record(
    'draft',
    'local-draft',
    0,
    1,
    0,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '{"title":"Local draft"}',
    'available',
    false,
    'aaaaaaaa-0000-4000-8000-000000000001',
    'operation-one'
  )$$,
  'an enabled owner can create a synchronized draft record'
);
select results_eq(
  $$select revision from public.sync_records
    where category = 'draft' and stable_id = 'local-draft'$$,
  array[1],
  'the first server revision is one'
);
select lives_ok(
  $$select public.sync_apply_record(
    'draft',
    'local-draft',
    0,
    1,
    0,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '{"title":"Local draft"}',
    'available',
    false,
    'aaaaaaaa-0000-4000-8000-000000000001',
    'operation-one'
  )$$,
  'replaying the same operation is idempotent'
);
select results_eq(
  $$select revision from public.sync_records
    where category = 'draft' and stable_id = 'local-draft'$$,
  array[1],
  'idempotent replay does not increment the revision'
);
select throws_ok(
  $$select public.sync_apply_record(
    'draft',
    'local-draft',
    0,
    1,
    0,
    null,
    '{"title":"stale write"}',
    'available',
    false,
    'aaaaaaaa-0000-4000-8000-000000000001',
    'operation-stale'
  )$$,
  '40001',
  null,
  'a stale device cannot overwrite a newer server revision'
);
select lives_ok(
  $$select public.sync_apply_record(
    'progress',
    'package@1.0.0#checksum',
    0,
    1,
    2,
    null,
    '{}',
    'available',
    true,
    'aaaaaaaa-0000-4000-8000-000000000001',
    'progress-reset-two'
  )$$,
  'progress reset generations and tombstones are retained'
);
select results_eq(
  $$select reset_generation, deleted from public.sync_records
    where category = 'progress'$$,
  $$values (2, true)$$,
  'older progress cannot silently resurrect after reset'
);
select throws_ok(
  $$select public.sync_apply_record(
    'progress',
    'package@1.0.0#checksum',
    1,
    1,
    1,
    null,
    '{"stale":true}',
    'available',
    false,
    'aaaaaaaa-0000-4000-8000-000000000001',
    'progress-stale-generation'
  )$$,
  '22023',
  null,
  'a client cannot lower an established progress reset generation'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
select is_empty(
  'select stable_id from public.sync_records',
  'a second user cannot read the first user records'
);
select is_empty(
  'select checksum from public.sync_blobs',
  'a second user cannot infer private checksums'
);
select is_empty(
  'select device_id from public.sync_devices',
  'a second user cannot read another device identity'
);
select is_empty(
  $$select name from storage.objects where bucket_id = 'account-sync'$$,
  'a second user cannot read another private artifact'
);
select throws_ok(
  $$insert into public.sync_records (
    owner_id, category, stable_id, revision, updated_by_device_id,
    last_operation_id
  ) values (
    '10000000-0000-4000-8000-000000000001',
    'draft',
    'forged',
    1,
    'aaaaaaaa-0000-4000-8000-000000000001',
    'forged-operation'
  )$$,
  '42501',
  null,
  'authenticated browsers cannot directly assign another owner'
);

set local role anon;
select throws_ok(
  $$select public.sync_register_device(
    'bbbbbbbb-0000-4000-8000-000000000002',
    'Anonymous browser',
    true
  )$$,
  '42501',
  null,
  'anonymous users cannot enable account synchronization'
);

select * from finish();
rollback;
