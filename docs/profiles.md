# Profiles

`public.profiles` is a one-to-one public projection of `auth.users`. It includes the user UUID,
normalized handle, display name, bio, optional avatar path, and timestamps. Email remains only in
Supabase Auth and is displayed solely to the authenticated user on private settings.

Handles are lowercase, 3–30 characters, start with a letter, and contain only letters, digits, and
underscores. The unique constraint is therefore case-insensitive. Platform and navigation names
such as `admin`, `auth`, `profiles`, `settings`, `studio`, and `theoria` are reserved.

An `auth.users` trigger creates the profile from validated signup metadata. RLS permits anonymous
and authenticated reads, permits authenticated users to update only their own row, and exposes no
client insert or delete policy. Column grants prevent users from updating `id`, `created_at`, or
`updated_at`; triggers normalize editable fields and maintain `updated_at`.

`/profiles/[handle]` shows only actual profile information, joined month, and an accurate empty
publishing state. `/settings/profile` edits the signed-in user's public fields.
