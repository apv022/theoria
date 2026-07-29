# Authorization

Supabase Auth establishes `auth.uid()`. A profile with the same ID is the only eligible package
owner. Anonymous users may read public profiles plus public or unlisted package metadata, version
metadata, and finalized source objects. Authenticated owners additionally read their private
packages and sources.

Browser roles have select-only grants on `packages` and `package_versions`. They cannot insert,
update, or delete releases directly. The authenticated publishing RPC is `security definer`, uses
an empty search path, derives its caller from `auth.uid()`, verifies the Storage object's owner and
exact path, and rejects another creator's package. No service-role credential reaches browser code.

The same-origin publishing route checks authentication again before using the platform adapter.
Slug availability is authenticated; public package/version pages and authorized downloads remain
readable without an account. Unauthorized private metadata and source downloads intentionally look
like not-found resources.

Local ownership is separate. Claiming a Studio draft writes the current user ID into that local
IndexedDB record only. Sign-in does not claim, merge, enumerate, or upload local content.

The pgTAP suite covers metadata visibility, ownership, immutable version triggers, package owner
protection, anonymous upload rejection, owner-path enforcement, finalized source deletion
rejection, and private Storage isolation.
