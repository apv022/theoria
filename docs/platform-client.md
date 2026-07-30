# Platform client

`@theoria/platform-client` is the replaceable hosted-service boundary. It defines:

- authentication requests, results, session events, and recovery;
- public profile reads and own-profile updates;
- stable user/package/draft ownership references;
- future organization membership shapes;
- paginated repository search, recent packages, subject collections, creator listings,
  package/version reads, and authorized source downloads;
- controlled publishing, slug checks, structured errors, cancellation, and progress;
- account synchronization counts, device registration, cursor-paginated records,
  expected-revision writes, and private checksum-addressed blob upload/download.

The Supabase adapter is the only package that invokes Supabase Auth, PostgREST, RPC, or Storage.
The Next.js app constructs browser and server clients with public environment variables and
consumes platform interfaces. An unavailable adapter provides a truthful local-mode fallback
rather than fake accounts or packages.

Browser components call the same-origin HTTP publishing client. The server route then uses the
cookie-backed Supabase platform adapter to hash, upload, and finalize the release. This preserves
the platform boundary and keeps privileged workflow decisions out of React. No service-role key is
used or exposed.

Repository reads use `search`, `listRecent`, `listProfilePackages`, `listSubjects`, `getBySlug`,
`getVersion`, and `downloadSource`. Search inputs and results are typed independently of Supabase
RPC rows. Results include total count, current page, page size, and total pages. Adapter failures
use structured retryable repository errors.

The Postgres adapter is the only layer that knows RPC argument names, flat rows, PostgREST
selection details, or Storage paths. `PlatformClient.sync` is consumed by the independent sync
engine; React never calls Supabase directly. Its unavailable implementation fails remote calls
truthfully while every local workflow remains usable. Organizations and recommendations remain
deferred. Components cannot infer that any local record exists remotely before a successful write.
