begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('public', 'packages', 'packages table exists');
select has_table(
  'public',
  'package_versions',
  'package_versions table exists'
);
select has_pk('public', 'packages', 'packages has a primary key');
select has_pk(
  'public',
  'package_versions',
  'package_versions has a primary key'
);
select col_is_unique(
  'public',
  'packages',
  'slug',
  'package slugs are unique'
);
select has_trigger(
  'public',
  'package_versions',
  'package_versions_are_immutable',
  'published version mutation is rejected'
);
select policies_are(
  'public',
  'packages',
  array['Visible packages or owner can read'],
  'packages expose only the visibility read policy'
);
select policies_are(
  'public',
  'package_versions',
  array['Visible package versions or owner can read'],
  'versions expose only the visibility read policy'
);
select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'package-sources'
      and not public
      and file_size_limit = 52428800
  ),
  'canonical source bucket is private and bounded'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'publisher-one@example.test',
    '{"handle":"publisher_one","display_name":"Publisher One"}'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'publisher-two@example.test',
    '{"handle":"publisher_two","display_name":"Publisher Two"}'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'package-sources',
      'packages/20000000-0000-0000-0000-000000000002/aaaaaaaa-0000-4000-8000-000000000001/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mcf.zip',
      '10000000-0000-0000-0000-000000000001',
      '{"mimetype":"application/zip","size":10}'
    )$$,
  '42501',
  null,
  'a user cannot upload into another owner path'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  (
    'package-sources',
    'packages/10000000-0000-0000-0000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mcf.zip',
    '10000000-0000-0000-0000-000000000001',
    '{"mimetype":"application/zip","size":10}'
  );

select lives_ok(
  $$select * from public.publish_package_version(
    'aaaaaaaa-0000-4000-8000-000000000001',
    'public-course',
    'Public course',
    'Published source',
    'public',
    '1.0.0',
    '1.1',
    'course',
    'packages/10000000-0000-0000-0000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mcf.zip',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '{"mcf":"1.1","kind":"course","id":"public-course","title":"Public course","version":"1.0.0","language":"en","entry":"course.yaml"}',
    '{"state":"valid","diagnostics":[]}',
    'First immutable release'
  )$$,
  'an owner can finalize a validated uploaded source'
);

select results_eq(
  $$select latest_version_id is not null
    from public.packages
    where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  array[true],
  'publishing updates the latest version pointer'
);

select throws_ok(
  $$select * from public.publish_package_version(
    'aaaaaaaa-0000-4000-8000-000000000001',
    'public-course',
    'Public course',
    'Published source',
    'public',
    '1.0.0',
    '1.1',
    'course',
    'packages/10000000-0000-0000-0000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mcf.zip',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '{"mcf":"1.1","kind":"course"}',
    '{"state":"valid","diagnostics":[]}',
    ''
  )$$,
  '23505',
  null,
  'a package version cannot be published twice'
);

reset role;
select throws_ok(
  $$update public.package_versions set release_notes = 'rewritten'
    where package_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '55000',
  null,
  'published version metadata is immutable even to elevated SQL callers'
);
select throws_ok(
  $$delete from public.package_versions
    where package_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '55000',
  null,
  'published versions cannot be deleted'
);
select throws_ok(
  $$update public.packages
    set owner_id = '20000000-0000-0000-0000-000000000002'
    where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '55000',
  null,
  'package ownership is immutable'
);

insert into public.packages (
  id, owner_id, slug, title, description, visibility
)
values
  (
    'bbbbbbbb-0000-4000-8000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'unlisted-course',
    'Unlisted',
    '',
    'unlisted'
  ),
  (
    'cccccccc-0000-4000-8000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'private-course',
    'Private',
    '',
    'private'
  );

insert into public.package_versions (
  id, package_id, version, mcf_version, package_kind,
  source_storage_path, source_checksum, manifest_summary,
  validation_summary, release_notes
)
values
  (
    'bbbbbbbb-1000-4000-8000-000000000002',
    'bbbbbbbb-0000-4000-8000-000000000002',
    '1.0.0',
    '1.1',
    'course',
    'packages/10000000-0000-0000-0000-000000000001/bbbbbbbb-0000-4000-8000-000000000002/1.0.0/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.mcf.zip',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '{"mcf":"1.1","kind":"course"}',
    '{"state":"valid","diagnostics":[]}',
    ''
  ),
  (
    'cccccccc-1000-4000-8000-000000000003',
    'cccccccc-0000-4000-8000-000000000003',
    '1.0.0',
    '1.1',
    'course',
    'packages/10000000-0000-0000-0000-000000000001/cccccccc-0000-4000-8000-000000000003/1.0.0/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.mcf.zip',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    '{"mcf":"1.1","kind":"course"}',
    '{"state":"valid","diagnostics":[]}',
    ''
  );

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  (
    'package-sources',
    'packages/10000000-0000-0000-0000-000000000001/bbbbbbbb-0000-4000-8000-000000000002/1.0.0/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.mcf.zip',
    '10000000-0000-0000-0000-000000000001',
    '{"mimetype":"application/zip","size":10}'
  ),
  (
    'package-sources',
    'packages/10000000-0000-0000-0000-000000000001/cccccccc-0000-4000-8000-000000000003/1.0.0/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.mcf.zip',
    '10000000-0000-0000-0000-000000000001',
    '{"mimetype":"application/zip","size":10}'
  );

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  'select slug from public.packages order by slug',
  array['public-course'::text, 'unlisted-course'::text],
  'anonymous readers see public and direct-access unlisted metadata'
);
select results_eq(
  'select count(*) from public.package_versions',
  array[2::bigint],
  'anonymous readers see versions of public and unlisted packages'
);
select results_eq(
  $$select count(*) from storage.objects
    where bucket_id = 'package-sources'$$,
  array[2::bigint],
  'anonymous readers can access public and unlisted finalized sources'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values (
      'package-sources',
      'packages/10000000-0000-0000-0000-000000000001/dddddddd-0000-4000-8000-000000000004/1.0.0/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.mcf.zip',
      '{"mimetype":"application/zip","size":10}'
    )$$,
  '42501',
  null,
  'anonymous users cannot upload source archives'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
select results_eq(
  'select slug from public.packages order by slug',
  array['public-course'::text, 'unlisted-course'::text],
  'another user cannot read private package metadata'
);
select results_eq(
  $$select count(*) from storage.objects
    where bucket_id = 'package-sources'$$,
  array[2::bigint],
  'another user cannot read a private source'
);
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'package-sources',
  'packages/20000000-0000-0000-0000-000000000002/aaaaaaaa-0000-4000-8000-000000000001/2.0.0/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.mcf.zip',
  '20000000-0000-0000-0000-000000000002',
  '{"mimetype":"application/zip","size":10}'
);
select throws_ok(
  $$select * from public.publish_package_version(
    'aaaaaaaa-0000-4000-8000-000000000001',
    'public-course',
    'Hijacked course',
    '',
    'public',
    '2.0.0',
    '1.1',
    'course',
    'packages/20000000-0000-0000-0000-000000000002/aaaaaaaa-0000-4000-8000-000000000001/2.0.0/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.mcf.zip',
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    '{"mcf":"1.1","kind":"course"}',
    '{"state":"valid","diagnostics":[]}',
    ''
  )$$,
  '42501',
  null,
  'a caller cannot publish a version under another creator package'
);
select throws_ok(
  $$insert into public.package_versions (
      package_id, version, mcf_version, package_kind,
      source_storage_path, source_checksum, manifest_summary,
      validation_summary
    ) values (
      'aaaaaaaa-0000-4000-8000-000000000001',
      '2.0.0',
      '1.1',
      'course',
      'packages/20000000-0000-0000-0000-000000000002/aaaaaaaa-0000-4000-8000-000000000001/2.0.0/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.mcf.zip',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      '{"mcf":"1.1","kind":"course"}',
      '{"state":"valid","diagnostics":[]}'
    )$$,
  '42501',
  null,
  'browser roles cannot bypass the controlled publishing operation'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  'select count(*) from public.packages',
  array[3::bigint],
  'the owner can read private package metadata'
);
select throws_ok(
  $$delete from storage.objects
    where bucket_id = 'package-sources'
      and name like '%aaaaaaaa%.mcf.zip'
    returning name$$,
  '42501',
  null,
  'an owner cannot delete a finalized canonical source directly'
);

select * from finish();
rollback;
