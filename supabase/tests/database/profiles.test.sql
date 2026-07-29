begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

select has_table('public', 'profiles', 'profiles table exists');
select has_pk('public', 'profiles', 'profiles has a primary key');
select col_is_pk('public', 'profiles', 'id', 'profile id is the primary key');
select has_column(
  'public',
  'profiles',
  'handle',
  'profiles expose a handle'
);
select hasnt_column(
  'public',
  'profiles',
  'email',
  'profiles never expose email'
);
select policies_are(
  'public',
  'profiles',
  array[
    'Public profiles are readable',
    'Users update only their own profile'
  ],
  'profiles have only the intended policies'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '10000000-0000-0000-0000-000000000001',
  'one@example.test',
  '{"handle":"Creator_One","display_name":"Creator One"}'
);
insert into auth.users (id, email, raw_user_meta_data)
values (
  '20000000-0000-0000-0000-000000000002',
  'two@example.test',
  '{"handle":"creator_two","display_name":"Creator Two"}'
);

select results_eq(
  $$select handle from public.profiles where id = '10000000-0000-0000-0000-000000000001'$$,
  array['creator_one'::text],
  'signup creates a normalized profile'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (
      '30000000-0000-0000-0000-000000000003',
      'duplicate@example.test',
      '{"handle":"CREATOR_ONE","display_name":"Duplicate"}'
    )$$,
  '23505',
  null,
  'handles are case-insensitively unique'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (
      '40000000-0000-0000-0000-000000000004',
      'invalid@example.test',
      '{"handle":"not valid!","display_name":"Invalid"}'
    )$$,
  '23514',
  null,
  'invalid handles are rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (
      '50000000-0000-0000-0000-000000000005',
      'reserved@example.test',
      '{"handle":"admin","display_name":"Reserved"}'
    )$$,
  '23514',
  null,
  'reserved handles are rejected'
);

set local role anon;
select results_eq(
  'select count(*) from public.profiles',
  array[2::bigint],
  'anonymous users can read public profiles'
);
select throws_ok(
  $$insert into public.profiles (id, handle, display_name)
    values (
      '60000000-0000-0000-0000-000000000006',
      'arbitrary',
      'Arbitrary'
    )$$,
  '42501',
  null,
  'anonymous users cannot create profiles'
);
select throws_ok(
  $$update public.profiles set display_name = 'Anonymous edit'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'anonymous users cannot update profiles'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select lives_ok(
  $$update public.profiles set display_name = 'Updated One'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  'users can update their own profile'
);
select results_eq(
  $$update public.profiles set display_name = 'Compromised'
    where id = '20000000-0000-0000-0000-000000000002'
    returning id$$,
  $$select id from public.profiles where false$$,
  'users cannot update another profile'
);
select throws_ok(
  $$update public.profiles
    set id = '20000000-0000-0000-0000-000000000002'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'users cannot assign another identity'
);

select * from finish();
rollback;
