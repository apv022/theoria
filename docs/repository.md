# Public repository

The public repository is built from stable `packages`, each package’s `latest_version_id`, the
corresponding immutable `package_versions` row, and its creator’s public profile. It does not copy
source archives into Postgres.

The homepage requests up to six newest public packages and subject collections derived from
canonical latest-version manifests. `/explore` requests nine rows per page. Creator profiles
request six newest public packages per page. Every listing operation is bounded by the database to
at most 24 rows and returns total count plus page metadata; no page loads the full catalog.

Cards show title, description excerpt, creator, kind, repository version, subjects, level, language,
license, publication date, MCF version, and validation state. Package and version pages show
canonical manifest metadata, learning outcomes, structure counts, attribution, checksum,
validation, release notes, and immutable history.

## Local Library handoff

Repository state remains remote; learning state remains browser-owned. Selecting Add to Library:

1. downloads one authorized canonical `.mcf.zip`;
2. runs secure archive handling and real `mcf-browser` validation;
3. verifies manifest identity, manifest version, and SHA-256 against the selected repository row;
4. stores the source in the existing local package and library stores;
5. exposes Open or Continue in the real Reader.

The local key includes manifest ID, manifest version, and checksum. A different release is offered
as a separate explicit addition and never replaces progress for an older version. Nothing is added
automatically.

Repository browsing needs connectivity. Offline, the UI reports that repository refresh is
unavailable while already-added packages and progress remain usable.
