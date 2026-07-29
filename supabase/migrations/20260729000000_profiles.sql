create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_normalized check (handle = lower(trim(handle))),
  constraint profiles_handle_format check (handle ~ '^[a-z][a-z0-9_]{2,29}$'),
  constraint profiles_handle_reserved check (
    handle <> all (
      array[
        'account', 'admin', 'api', 'auth', 'create', 'explore', 'help',
        'library', 'login', 'logout', 'moderator', 'packages', 'profile',
        'profiles', 'reset_password', 'root', 'settings', 'signup', 'studio',
        'support', 'system', 'theoria'
      ]
    )
  ),
  constraint profiles_display_name_length check (
    char_length(display_name) between 1 and 80
  ),
  constraint profiles_bio_length check (char_length(bio) <= 500),
  constraint profiles_avatar_path_length check (
    avatar_path is null or char_length(avatar_path) <= 512
  )
);

comment on table public.profiles is
  'Public account identity. Email and authentication data remain private in auth.users.';
comment on column public.profiles.avatar_path is
  'Optional storage-relative avatar path; external URL policy is deferred.';

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (handle, display_name, bio, avatar_path)
  on table public.profiles to authenticated;

create policy "Public profiles are readable"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "Users update only their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.set_profile_updated_at()
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
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_handle text;
  requested_display_name text;
begin
  requested_handle := lower(trim(coalesce(new.raw_user_meta_data ->> 'handle', '')));
  if requested_handle = '' then
    requested_handle := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  requested_display_name := trim(
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  );
  if requested_display_name = '' then
    requested_display_name := requested_handle;
  end if;

  insert into public.profiles (id, handle, display_name)
  values (new.id, requested_handle, requested_display_name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.set_profile_updated_at() from public;
revoke all on function public.handle_new_user() from public;
