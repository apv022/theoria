# Platform client

`@theoria/platform-client` is the replaceable hosted-service boundary. It defines:

- authentication requests, results, session events, and recovery;
- public profile reads and own-profile updates;
- stable user/package/draft ownership references;
- future organization membership shapes;
- repository package/version reads and authorized source downloads;
- controlled publishing, slug checks, structured errors, cancellation, and progress;
- deferred synchronization capabilities.

The Supabase adapter is the only package that invokes Supabase Auth, PostgREST, RPC, or Storage.
The Next.js app constructs browser and server clients with public environment variables and
consumes platform interfaces. An unavailable adapter provides a truthful local-mode fallback
rather than fake accounts or packages.

Browser components call the same-origin HTTP publishing client. The server route then uses the
cookie-backed Supabase platform adapter to hash, upload, and finalize the release. This preserves
the platform boundary and keeps privileged workflow decisions out of React. No service-role key is
used or exposed.

Repository reads use `getBySlug`, `getVersion`, and `downloadSource`. Search deliberately returns
an empty result because discovery is out of scope. Organizations and all synchronization remain
deferred. Components cannot infer that any local record exists remotely.
