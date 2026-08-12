begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

select has_function(
  'public',
  'repository_packages',
  array[
    'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'text', 'integer', 'integer'
  ],
  'repository_packages query function exists'
);
select has_function(
  'public',
  'repository_subjects',
  array['integer'],
  'repository_subjects query function exists'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'search-one@example.test',
    '{"handle":"search_author","display_name":"Search Author"}'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'search-two@example.test',
    '{"handle":"science_author","display_name":"Science Author"}'
  );

insert into public.packages (
  id, owner_id, slug, title, description, visibility, created_at, updated_at
)
values
  (
    'aaaaaaaa-0000-4000-8000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'calculus-foundations',
    'Calculus Foundations',
    'Foundations of limits and change.',
    'public',
    '2026-07-01T00:00:00Z',
    '2026-07-20T00:00:00Z'
  ),
  (
    'bbbbbbbb-0000-4000-8000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'geometry-studio',
    'Geometry Studio',
    'Explore shapes and proofs.',
    'public',
    '2026-07-02T00:00:00Z',
    '2026-07-21T00:00:00Z'
  ),
  (
    'cccccccc-0000-4000-8000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    'earth-science',
    'Earth Science',
    'Investigate planetary systems.',
    'public',
    '2026-07-03T00:00:00Z',
    '2026-07-22T00:00:00Z'
  ),
  (
    'dddddddd-0000-4000-8000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'unlisted-calculus',
    'Unlisted Calculus',
    'Direct link only.',
    'unlisted',
    '2026-07-04T00:00:00Z',
    '2026-07-23T00:00:00Z'
  ),
  (
    'eeeeeeee-0000-4000-8000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'private-calculus',
    'Private Calculus',
    'Owner only.',
    'private',
    '2026-07-05T00:00:00Z',
    '2026-07-24T00:00:00Z'
  );

insert into public.package_versions (
  id, package_id, version, mcf_version, package_kind, source_storage_path,
  source_checksum, manifest_summary, validation_summary, release_notes,
  published_at
)
values
  (
    'aaaaaaaa-1000-4000-8000-000000000001',
    'aaaaaaaa-0000-4000-8000-000000000001',
    '1.0.0',
    '1.1',
    'course',
    'packages/10000000-0000-0000-0000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mcf.zip',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '{"mcf":"1.1","kind":"course","id":"calculus-foundations","title":"Calculus Foundations","version":"1.0.0","language":"en","authors":[],"license":"CC-BY-4.0","subjects":["mathematics"],"keywords":["derivative","limit"],"level":{"identifier":"secondary","label":"Secondary"},"learningOutcomes":[{"id":"equations","statement":"Solve equations using rates of change."}]}',
    '{"state":"valid","diagnostics":[]}',
    '',
    '2026-07-30T03:00:00Z'
  ),
  (
    'bbbbbbbb-1000-4000-8000-000000000002',
    'bbbbbbbb-0000-4000-8000-000000000002',
    '1.0.0',
    '1.1',
    'module',
    'packages/10000000-0000-0000-0000-000000000001/bbbbbbbb-0000-4000-8000-000000000002/1.0.0/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.mcf.zip',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '{"mcf":"1.1","kind":"module","id":"geometry-studio","title":"Geometry Studio","version":"1.0.0","language":"fr","authors":[],"subjects":["mathematics"],"keywords":["angles"],"level":{"identifier":"secondary"},"learningOutcomes":[{"statement":"Construct geometric proofs."}]}',
    '{"state":"valid","diagnostics":[]}',
    '',
    '2026-07-29T02:00:00Z'
  ),
  (
    'cccccccc-1000-4000-8000-000000000003',
    'cccccccc-0000-4000-8000-000000000003',
    '1.0.0',
    '1.1',
    'course',
    'packages/20000000-0000-0000-0000-000000000002/cccccccc-0000-4000-8000-000000000003/1.0.0/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.mcf.zip',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    '{"mcf":"1.1","kind":"course","id":"earth-science","title":"Earth Science","version":"1.0.0","language":"en","authors":[],"subjects":["science"],"keywords":["planet"],"level":{"identifier":"primary"},"learningOutcomes":[{"statement":"Describe planetary systems."}]}',
    '{"state":"valid","diagnostics":[]}',
    '',
    '2026-07-28T01:00:00Z'
  ),
  (
    'dddddddd-1000-4000-8000-000000000004',
    'dddddddd-0000-4000-8000-000000000004',
    '1.0.0',
    '1.1',
    'course',
    'packages/10000000-0000-0000-0000-000000000001/dddddddd-0000-4000-8000-000000000004/1.0.0/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.mcf.zip',
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    '{"mcf":"1.1","kind":"course","id":"unlisted-calculus","title":"Unlisted Calculus","version":"1.0.0","language":"en","authors":[],"subjects":["mathematics"],"keywords":["hidden"]}',
    '{"state":"valid","diagnostics":[]}',
    '',
    '2026-07-31T00:00:00Z'
  ),
  (
    'eeeeeeee-1000-4000-8000-000000000005',
    'eeeeeeee-0000-4000-8000-000000000005',
    '1.0.0',
    '1.1',
    'course',
    'packages/10000000-0000-0000-0000-000000000001/eeeeeeee-0000-4000-8000-000000000005/1.0.0/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.mcf.zip',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    '{"mcf":"1.1","kind":"course","id":"private-calculus","title":"Private Calculus","version":"1.0.0","language":"en","authors":[],"subjects":["mathematics"],"keywords":["secret"]}',
    '{"state":"valid","diagnostics":[]}',
    '',
    '2026-08-01T00:00:00Z'
  );

update public.packages
set latest_version_id = case id
  when 'aaaaaaaa-0000-4000-8000-000000000001'
    then 'aaaaaaaa-1000-4000-8000-000000000001'::uuid
  when 'bbbbbbbb-0000-4000-8000-000000000002'
    then 'bbbbbbbb-1000-4000-8000-000000000002'::uuid
  when 'cccccccc-0000-4000-8000-000000000003'
    then 'cccccccc-1000-4000-8000-000000000003'::uuid
  when 'dddddddd-0000-4000-8000-000000000004'
    then 'dddddddd-1000-4000-8000-000000000004'::uuid
  else 'eeeeeeee-1000-4000-8000-000000000005'::uuid
end;

set local role anon;

select results_eq(
  $$select slug from public.repository_packages(
    '', '', '', '', '', '', 'title', '', 20, 0
  ) order by slug$$,
  array['calculus-foundations'::text, 'earth-science', 'geometry-studio'],
  'browse returns only public packages'
);
select is_empty(
  $$select slug from public.repository_packages(
    'Unlisted Calculus', '', '', '', '', '', 'relevance', '', 20, 0
  )$$,
  'unlisted packages are excluded from search'
);
select is_empty(
  $$select slug from public.repository_packages(
    'Private Calculus', '', '', '', '', '', 'relevance', '', 20, 0
  )$$,
  'private packages are excluded from search'
);
select results_eq(
  $$select slug from public.repository_packages(
    'Calculus', '', '', '', '', '', 'relevance', '', 20, 0
  )$$,
  array['calculus-foundations'::text],
  'title search finds public packages'
);
select results_eq(
  $$select slug from public.repository_packages(
    'limits', '', '', '', '', '', 'relevance', '', 20, 0
  )$$,
  array['calculus-foundations'::text],
  'description search is indexed'
);
select results_eq(
  $$select slug from public.repository_packages(
    'derivative', '', '', '', '', '', 'relevance', '', 20, 0
  )$$,
  array['calculus-foundations'::text],
  'keyword search uses canonical manifest metadata'
);
select results_eq(
  $$select slug from public.repository_packages(
    'equations', '', '', '', '', '', 'relevance', '', 20, 0
  )$$,
  array['calculus-foundations'::text],
  'learning outcome search uses canonical manifest metadata'
);
select results_eq(
  $$select slug from public.repository_packages(
    'search_author', '', '', '', '', '', 'relevance', '', 20, 0
  ) order by slug$$,
  array['calculus-foundations'::text, 'geometry-studio'],
  'creator handle search finds public packages'
);
select results_eq(
  $$select slug from public.repository_packages(
    '', 'mathematics', 'secondary', 'en', 'course', '1.1',
    'newest', '', 20, 0
  )$$,
  array['calculus-foundations'::text],
  'filters combine deterministically'
);
select results_eq(
  $$select slug from public.repository_packages(
    '', '', '', '', '', '', 'title', '', 20, 0
  )$$,
  array['calculus-foundations'::text, 'earth-science', 'geometry-studio'],
  'title sorting is stable'
);
select results_eq(
  $$select slug from public.repository_packages(
    '', '', '', '', '', '', 'newest', '', 20, 0
  )$$,
  array['calculus-foundations'::text, 'geometry-studio', 'earth-science'],
  'newest sorting is stable'
);
select results_eq(
  $$select slug from public.repository_packages(
    '', '', '', '', '', '', 'title', '', 1, 0
  )$$,
  array['calculus-foundations'::text],
  'first page is bounded'
);
select results_eq(
  $$select slug from public.repository_packages(
    '', '', '', '', '', '', 'title', '', 1, 1
  )$$,
  array['earth-science'::text],
  'second page has the next stable row'
);
select results_eq(
  $$select distinct total_count from public.repository_packages(
    '', '', '', '', '', '', 'title', '', 1, 0
  )$$,
  array[3::bigint],
  'pagination returns the full result count'
);
select results_eq(
  $$select slug from public.repository_packages(
    '', '', '', '', '', '', 'newest', 'search_author', 20, 0
  )$$,
  array['calculus-foundations'::text, 'geometry-studio'],
  'creator listings include only public packages'
);
select results_eq(
  $$select subject, package_count
    from public.repository_subjects(10)$$,
  $$values ('mathematics'::text, 2::bigint), ('science'::text, 1::bigint)$$,
  'subject collections are derived from public canonical metadata'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select is_empty(
  $$select slug from public.repository_packages(
    'Private Calculus', '', '', '', '', '', 'relevance', '', 20, 0
  )$$,
  'owners still do not see private packages in public discovery'
);
select results_eq(
  $$select count(*) from public.repository_packages(
    '', 'mathematics', '', '', '', '', 'newest', '', 20, 0
  )$$,
  array[2::bigint],
  'subject filters exclude unlisted and private packages'
);

select * from finish();
rollback;
