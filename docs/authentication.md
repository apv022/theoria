# Authentication

Accounts are optional. The application runs in local mode when either public Supabase variable is
missing. Compiler, Library, Reader, Studio, IndexedDB, offline progress, and exports do not consult
authentication before operating.

The dependency flow is:

```text
auth/profile UI
  -> platform-client contracts
  -> Supabase adapter
  -> Supabase Auth and PostgREST
```

`AuthProvider` owns the browser client, restores the cookie-backed session, subscribes to Auth
events, and reports expired sessions as signed out. The Next.js request proxy refreshes sessions
only on account/profile routes. `/auth/callback` exchanges PKCE codes for signup verification and
password recovery. No service-role key or admin API is used.

Production deployments must set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin. Signup and
recovery email redirects are built from that value, not the browser's preview-deployment origin.
Callback and login destinations accept only local absolute paths and reject protocol-relative,
backslash, and control-character variants.

Supported flows are email/password signup and login, logout, verification-pending feedback,
password-recovery initiation, recovery callback, authenticated password change, and session
restoration. Social OAuth is not configured.

Before production signup is enabled, configure the Supabase Auth Site URL and exact
`/auth/callback` allowlist entry, use custom SMTP, verify sender-domain SPF/DKIM/DMARC, and test
confirmation, recovery, expired-link, and reused-link journeys from real email clients. Preview
redirect wildcards should be added only when preview email flows are deliberately supported.

Signing in never scans, uploads, merges, deletes, or overwrites IndexedDB. A signed-in creator may
explicitly claim a local draft. Compilations and library entries produced from that draft inherit
the local ownership reference, but nothing is sent to Supabase.
