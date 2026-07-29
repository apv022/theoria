# Platform client

`@theoria/platform-client` is the replaceable hosted-service boundary. It defines:

- authentication requests, results, session events, and recovery;
- public profile reads and own-profile updates;
- stable user/package/draft ownership references;
- future organization membership shapes;
- deferred repository, publishing, and synchronization capabilities.

The Supabase adapter is the only package that invokes Supabase Auth or PostgREST. The Next.js app
constructs browser and server clients with public environment variables and consumes platform
interfaces. An unavailable adapter provides a truthful local-mode fallback rather than fake
accounts.

Repository, publishing, organizations, and synchronization interfaces have no active adapter in
Stage Five. Components cannot infer that local records exist remotely.
