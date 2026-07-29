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

Supported flows are email/password signup and login, logout, verification-pending feedback,
password-recovery initiation, recovery callback, authenticated password change, and session
restoration. Social OAuth is not configured.

Signing in never scans, uploads, merges, deletes, or overwrites IndexedDB. A signed-in creator may
explicitly claim a local draft. Compilations and library entries produced from that draft inherit
the local ownership reference, but nothing is sent to Supabase.
