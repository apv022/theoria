# Repository visibility

Visibility is enforced at both direct-read RLS and public listing-query boundaries.

| Visibility | Direct URL               | Explore/search/home           | Creator listing | Source                 |
| ---------- | ------------------------ | ----------------------------- | --------------- | ---------------------- |
| Public     | Anyone                   | Included                      | Included        | Anyone                 |
| Unlisted   | Anyone with slug/version | Excluded                      | Excluded        | Anyone with direct URL |
| Private    | Owner only               | Excluded, including for owner | Excluded        | Owner only             |

`repository_packages` and `repository_subjects` contain an explicit
`packages.visibility = 'public'` condition inside security-definer functions. They do not rely on a
React filter or on the broader direct-read RLS policy, which intentionally permits unlisted direct
access. Profile counts are derived from the same public-only query.

Direct package/version reads continue through RLS: public and unlisted are readable anonymously;
private rows are visible only when `owner_id = auth.uid()`. Storage authorization follows the
finalized package visibility. Unauthorized and missing private source requests share an opaque
not-found response.

No listing exposes email, local drafts, learner progress, compilation history, or local library
activity.
