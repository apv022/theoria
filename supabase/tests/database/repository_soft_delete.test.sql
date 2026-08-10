begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

select has_column(
  'public', 'packages', 'deleted_at',
  'repositories have a tombstone timestamp'
);
select has_function(
  'public', 'soft_delete_package', array['uuid'],
  'soft deletion is exposed as a scoped RPC'
);
select has_trigger(
  'public', 'packages', 'prevent_deleted_package_mutation',
  'deleted packages cannot be mutated through ordinary updates'
);
select has_trigger(
  'public', 'package_versions', 'package_versions_are_immutable',
  'published versions remain immutable'
);
select policies_are(
  'public', 'packages', array['Visible packages or owner can read'],
  'deleted packages remain behind the normal package read policy'
);
select policies_are(
  'public', 'package_versions', array['Visible package versions or owner can read'],
  'deleted package versions remain behind the normal version read policy'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'soft-owner@example.test',
   '{"handle":"soft_owner","display_name":"Soft Owner"}'),
  ('20000000-0000-0000-0000-000000000002', 'soft-visitor@example.test',
   '{"handle":"soft_visitor","display_name":"Soft Visitor"}');

reset role;
select lives_ok($$
  insert into public.packages (id, owner_id, slug, title, visibility)
  values
    ('aaaaaaaa-0000-4000-8000-000000000001',
     '10000000-0000-0000-0000-000000000001',
     'soft-delete-parent', 'Soft delete parent', 'public')
$$, 'the owner repository can be created');

insert into public.package_versions (
  id, package_id, version, mcf_version, package_kind,
  source_storage_path, source_checksum, manifest_summary,
  validation_summary, release_notes
)
values
  ('aaaaaaaa-1000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', '1.0.0', '1.1', 'course',
   'packages/10000000-0000-0000-0000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mcf.zip',
   'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   '{"mcf":"1.1","kind":"course","id":"soft-delete-parent","title":"Soft delete parent","version":"1.0.0","language":"en","authors":[]}',
   '{"state":"valid","diagnostics":[]}', '');

update public.packages
set latest_version_id = 'aaaaaaaa-1000-4000-8000-000000000001'
where id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into public.packages (
  id, owner_id, slug, title, visibility, parent_package_id, parent_version_id
)
values (
  'bbbbbbbb-0000-4000-8000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  'soft-delete-child', 'Soft delete child', 'public',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-1000-4000-8000-000000000001'
);

insert into public.package_versions (
  id, package_id, version, mcf_version, package_kind,
  source_storage_path, source_checksum, manifest_summary,
  validation_summary, release_notes
)
values (
  'bbbbbbbb-1000-4000-8000-000000000002',
  'bbbbbbbb-0000-4000-8000-000000000002', '1.0.0', '1.1', 'course',
  'packages/20000000-0000-0000-0000-000000000002/bbbbbbbb-0000-4000-8000-000000000002/1.0.0/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.mcf.zip',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '{"mcf":"1.1","kind":"course","id":"soft-delete-child","title":"Soft delete child","version":"1.0.0","language":"en","authors":[]}',
  '{"state":"valid","diagnostics":[]}', ''
);

update public.packages
set latest_version_id = 'bbbbbbbb-1000-4000-8000-000000000002'
where id = 'bbbbbbbb-0000-4000-8000-000000000002';

set local role anon;
select throws_ok(
  $$select * from public.soft_delete_package(
    'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  '42501', null, 'anonymous callers cannot tombstone a repository'
);

set local role authenticated;
select set_config('request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select * from public.set_package_star(
    'aaaaaaaa-0000-4000-8000-000000000001', true
  )$$,
  'an existing star can be retained before tombstoning'
);

select set_config('request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$select package_id, deleted_at is not null
    from public.soft_delete_package(
      'aaaaaaaa-0000-4000-8000-000000000001'
    )$$,
  $$values (
    'aaaaaaaa-0000-4000-8000-000000000001'::uuid, true
  )$$,
  'the owner can tombstone a repository'
);
select results_eq(
  $$select count(*) from public.soft_delete_package(
    'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  array[1::bigint],
  'repeating deletion is idempotent'
);

select set_config('request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.soft_delete_package(
    'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  '42501', null, 'a non-owner cannot tombstone a repository'
);
select results_eq(
  $$select count(*) from public.packages
    where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  array[0::bigint],
  'normal package reads hide a tombstoned repository'
);
select results_eq(
  $$select count(*) from public.repository_packages(
    '', '', '', '', '', '', 'newest', '', 24, 0
  ) where package_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  array[0::bigint],
  'search excludes a tombstoned repository'
);
select results_eq(
  $$select count(*) from public.repository_package_network(
    'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  array[0::bigint],
  'network access treats a tombstoned repository as unavailable'
);
select throws_ok(
  $$select * from public.set_package_star(
    'aaaaaaaa-0000-4000-8000-000000000001', true
  )$$,
  '42501', null, 'a tombstoned repository cannot be newly starred'
);

reset role;
select results_eq(
  $$select count(*) from public.package_versions
    where package_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  array[1::bigint],
  'immutable versions remain stored'
);
select results_eq(
  $$select package_id from public.packages
    where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
  array['bbbbbbbb-0000-4000-8000-000000000002'::uuid],
  'descendant lineage remains structurally intact'
);
select results_eq(
  $$select parent_package_id from public.packages
    where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
  array['aaaaaaaa-0000-4000-8000-000000000001'::uuid],
  'descendants retain the tombstoned parent provenance'
);
select results_eq(
  $$select public.can_read_package_source(
    'packages/10000000-0000-0000-0000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mcf.zip'
  )$$,
  array[false],
  'source archives are retained but unavailable through normal downloads'
);
reset role;
select throws_ok(
  $$delete from public.package_versions
    where id = 'aaaaaaaa-1000-4000-8000-000000000001'$$,
  '55000', null, 'tombstoning does not weaken immutable version protection'
);

select * from finish();
rollback;
