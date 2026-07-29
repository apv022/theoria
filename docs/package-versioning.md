# Package versioning

`packages` is the stable repository identity: owner, normalized unique slug, presentation metadata,
visibility, and latest-version pointer. `package_versions` is the immutable release ledger.

Each package/version pair is unique and the version follows semantic-version syntax. MCF version
and package kind are constrained to supported values. The source path and SHA-256 checksum are
stored with the manifest summary, validation summary, release notes, and publication timestamp.
The latest pointer uses a composite foreign key so it cannot reference another package.

Published version rows cannot be updated or deleted, including by an elevated database caller; a
trigger rejects both operations. Browser roles receive no write grants. Package ownership is also
immutable. A controlled publishing function may update a package title, description, visibility,
and latest pointer while adding a new immutable release. Its stable slug cannot change after the
first release.

Changing a local draft never changes an existing release. A creator publishes the edit as a new
semantic version. Previously published source bytes, checksum, manifest evidence, notes, and date
remain available exactly as recorded.

Version ordering in the minimal package page is publication-time history; Stage Six does not add
channels, tags, deprecation, discovery ranking, or compatibility resolution.
