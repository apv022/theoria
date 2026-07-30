# Repository search

`repository_packages` is the public listing/query boundary. It joins a package to its latest
immutable version and creator profile, then applies full-text search, exact canonical filters,
stable ordering, and bounded offset pagination.

## Indexed document and ranking

Postgres `simple` dictionaries index:

- package title, slug, and description;
- creator handle and display name;
- canonical latest-version subjects, keywords, level, and learning outcomes.

GIN expression indexes back those documents. Trigram indexes support partial title, slug, and
creator-handle matching. Relevance uses explicit weights: title/slug are strongest,
description/creator next, and manifest discovery metadata third. Ties use latest publication date,
then normalized title and package UUID. This is search relevance only—there is no personalized,
behavioral, sponsored, or recommendation rank.

Filters cover subject, level, language, package kind, and MCF version. Subject/level/language values
come from the validated canonical manifest summary, not independent client-supplied search fields.
Sorts are relevance, newest publication, recently updated package identity, and title.

Explore state lives in query parameters (`q`, `subject`, `level`, `language`, `kind`, `mcf`, `sort`,
and `page`). Search text is debounced; filter changes reset to page one. URLs can be copied,
reloaded, and navigated with browser history.

Known limitation: page-based pagination can shift when publications occur between requests. Stable
tie-breakers prevent duplicates within one catalog state, but Stage Seven does not implement a
snapshot cursor. Releases published before extended manifest summaries were captured may lack
subjects, keywords, level, or learning outcomes until a new version is published.
