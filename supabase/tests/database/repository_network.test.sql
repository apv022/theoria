begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

select has_table('public', 'package_stars', 'package stars exist');
select has_pk('public', 'package_stars', 'one star per user and package');
select has_column('public', 'packages', 'parent_version_id', 'exact parent release is recorded');
select has_column('public', 'package_versions', 'source_size', 'immutable releases record byte size');
select policies_are(
  'public',
  'package_stars',
  array['Users read only their accessible stars'],
  'star rows expose only the owner accessible bookmark policy'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'network-one@example.test',
    '{"handle":"network_one","display_name":"Network One"}'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'network-two@example.test',
    '{"handle":"network_two","display_name":"Network Two"}'
  );

insert into public.packages (
  id, owner_id, slug, title, description, visibility
)
values
  (
    'aaaaaaaa-0000-4000-8000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'network-parent', 'Network parent', '', 'public'
  ),
  (
    'bbbbbbbb-0000-4000-8000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'network-private', 'Network private', '', 'private'
  );

insert into public.package_versions (
  id, package_id, version, mcf_version, package_kind,
  source_storage_path, source_checksum, source_size, manifest_summary,
  validation_summary, release_notes
)
values
  (
    'aaaaaaaa-1000-4000-8000-000000000001',
    'aaaaaaaa-0000-4000-8000-000000000001',
    '1.0.0', '1.1', 'course',
    'packages/10000000-0000-0000-0000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mcf.zip',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    512,
    '{"mcf":"1.1","kind":"course","id":"network-parent","title":"Network parent","version":"1.0.0","language":"en","authors":[]}',
    '{"state":"valid","diagnostics":[]}', ''
  ),
  (
    'bbbbbbbb-1000-4000-8000-000000000002',
    'bbbbbbbb-0000-4000-8000-000000000002',
    '1.0.0', '1.1', 'course',
    'packages/10000000-0000-0000-0000-000000000001/bbbbbbbb-0000-4000-8000-000000000002/1.0.0/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.mcf.zip',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    256,
    '{"mcf":"1.1","kind":"course","id":"network-private","title":"Network private","version":"1.0.0","language":"en","authors":[]}',
    '{"state":"valid","diagnostics":[]}', ''
  );

update public.packages set latest_version_id = case id
  when 'aaaaaaaa-0000-4000-8000-000000000001'
    then 'aaaaaaaa-1000-4000-8000-000000000001'::uuid
  else 'bbbbbbbb-1000-4000-8000-000000000002'::uuid
end;

set local role anon;
select results_eq(
  $$select star_count from public.repository_package_network(
    'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  array[0::bigint],
  'signed-out visitors see public star totals'
);
select throws_ok(
  $$select * from public.set_package_star(
    'aaaaaaaa-0000-4000-8000-000000000001', true
  )$$,
  '42501', null, 'signed-out visitors cannot star'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$select starred, star_count from public.set_package_star(
    'aaaaaaaa-0000-4000-8000-000000000001', true
  )$$,
  $$values (true, 1::bigint)$$,
  'an authenticated visitor can star an accessible course'
);
select results_eq(
  $$select starred, star_count from public.set_package_star(
    'aaaaaaaa-0000-4000-8000-000000000001', true
  )$$,
  $$values (true, 1::bigint)$$,
  'starring is idempotent'
);
reset role;
select throws_ok(
  $$insert into public.package_stars (user_id, package_id) values (
    '20000000-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  '23505', null, 'the database prevents duplicate stars'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.set_package_star(
    'bbbbbbbb-0000-4000-8000-000000000002', true
  )$$,
  '42501', null, 'another user cannot star a private course'
);
select results_eq(
  $$select package_id from public.repository_starred_package_ids(12, 0)$$,
  array['aaaaaaaa-0000-4000-8000-000000000001'::uuid],
  'starred listings contain accessible courses only'
);
select results_eq(
  $$select starred, star_count from public.set_package_star(
    'aaaaaaaa-0000-4000-8000-000000000001', false
  )$$,
  $$values (false, 0::bigint)$$,
  'unstarring is idempotent and updates the aggregate'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'package-sources',
  'packages/20000000-0000-0000-0000-000000000002/cccccccc-0000-4000-8000-000000000003/1.0.0/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.mcf.zip',
  '20000000-0000-0000-0000-000000000002',
  '{"mimetype":"application/zip","size":640}'
);
select lives_ok(
  $$select * from public.publish_package_version(
    'cccccccc-0000-4000-8000-000000000003',
    'network-fork', 'Network fork', '', 'public', '1.0.0', '1.1', 'course',
    'packages/20000000-0000-0000-0000-000000000002/cccccccc-0000-4000-8000-000000000003/1.0.0/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.mcf.zip',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    '{"mcf":"1.1","kind":"course","id":"network-fork","title":"Network fork","version":"1.0.0","language":"en","authors":[]}',
    '{"state":"valid","diagnostics":[]}', 'Forked release', 640,
    'aaaaaaaa-0000-4000-8000-000000000001',
    'aaaaaaaa-1000-4000-8000-000000000001'
  )$$,
  'an accessible exact release can be published as a fork'
);
select results_eq(
  $$select parent_package_id, parent_version_id from public.packages
    where id = 'cccccccc-0000-4000-8000-000000000003'$$,
  $$values (
    'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
    'aaaaaaaa-1000-4000-8000-000000000001'::uuid
  )$$,
  'fork lineage stores the exact parent repository and version'
);
select results_eq(
  $$select fork_count from public.repository_package_network(
    'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  array[1::bigint],
  'the parent network reports direct public forks'
);
select results_eq(
  $$select parent_slug, parent_version from public.repository_package_network(
    'cccccccc-0000-4000-8000-000000000003'
  )$$,
  $$values ('network-parent'::text, '1.0.0'::text)$$,
  'a fork reports its exact visible parent release'
);

reset role;
select throws_ok(
  $$update public.packages set parent_package_id = null, parent_version_id = null
    where id = 'cccccccc-0000-4000-8000-000000000003'$$,
  '55000', null, 'published lineage cannot be removed'
);
select throws_ok(
  $$insert into public.packages (
    id, owner_id, slug, title, description, visibility,
    parent_package_id, parent_version_id
  ) values (
    'dddddddd-0000-4000-8000-000000000004',
    '20000000-0000-0000-0000-000000000002',
    'duplicate-fork', 'Duplicate fork', '', 'public',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'aaaaaaaa-1000-4000-8000-000000000001'
  )$$,
  '23505', null, 'duplicate fork actions cannot create a second repository'
);
select results_eq(
  $$select source_size from public.package_versions
    where package_id = 'cccccccc-0000-4000-8000-000000000003'$$,
  array[640::bigint],
  'published versions retain their exact archive size'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$select count(*) from public.publish_package_version(
    'cccccccc-0000-4000-8000-000000000003',
    'network-fork', 'Network fork', '', 'public', '1.0.0', '1.1', 'course',
    'packages/20000000-0000-0000-0000-000000000002/cccccccc-0000-4000-8000-000000000003/1.0.0/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.mcf.zip',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    '{"mcf":"1.1","kind":"course","id":"network-fork","title":"Network fork","version":"1.0.0","language":"en","authors":[]}',
    '{"state":"valid","diagnostics":[]}', 'Forked release', 640,
    'aaaaaaaa-0000-4000-8000-000000000001',
    'aaaaaaaa-1000-4000-8000-000000000001'
  )$$,
  array[1::bigint],
  'an exact publication retry returns the existing immutable release'
);
select results_eq(
  $$select public_package_count, total_version_count
    from public.profile_repository_summary('network_two')$$,
  $$values (1::bigint, 1::bigint)$$,
  'profile aggregates count public repositories and immutable versions'
);

reset role;
update public.packages
set visibility = 'unlisted'
where id = 'cccccccc-0000-4000-8000-000000000003';
set local role anon;
select results_eq(
  $$select public_package_count, total_version_count
    from public.profile_repository_summary('network_two')$$,
  $$values (0::bigint, 0::bigint)$$,
  'hidden work does not leak through profile aggregates'
);
select results_eq(
  $$select fork_count from public.repository_package_network(
    'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  array[0::bigint],
  'hidden forks do not leak through public lineage'
);

select * from finish();
rollback;
