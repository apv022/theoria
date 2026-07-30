# Published source storage

Canonical source archives use the private `package-sources` bucket:

```text
packages/{owner_id}/{package_id}/{version}/{sha256}.mcf.zip
```

The bucket accepts ZIP MIME types up to 50 MiB. Postgres stores only path, checksum, manifest and
validation summaries, and release metadata—not archive blobs. Upload uses `upsert: false`, so an
existing object cannot be replaced.

Storage insert policy requires an authenticated object owner, an exact first `packages` segment,
and a second segment equal to `auth.uid()`. The remaining stable UUID/version/checksum shape is
constrained. Finalization reconstructs the entire expected path from the authenticated caller and
submitted identity, then confirms the object and owner.

Select policy delegates to finalized package metadata: public and unlisted releases are readable;
private releases are owner-only. An owner may also select their own path so Storage can clean up an
unfinalized upload. The source download route uses the same platform repository and returns an
opaque not-found response for missing and unauthorized objects. Delete policy permits an owner to
clean up only an object that no `package_versions` row references. There is no update policy.

Visibility governs every version of a package. “Unlisted” means direct-link readable and excluded
from future search; no discovery implementation exists yet. Bucket privacy must not be changed to
simulate public packages.

# Account-sync storage

Private synchronized artifacts use the separate private `account-sync` bucket:

```text
users/{owner_id}/{draft|local_package|source|compiled|record_binary}/{sha256}
```

`sync_blobs` deduplicates by owner and checksum; `blob_kind` records the path chosen by the first
reference. Browser uploads use `upsert: false`; no
Storage update or delete policy exists, so registered objects are immutable. Insert policy requires
the authenticated user's exact `users/{auth.uid()}/...` prefix and a 64-character lowercase SHA-256
name. Select requires both ownership of the path and an owner-visible `sync_blobs` registry row,
preventing path or checksum discovery across accounts.

The sync engine chooses a 25 MiB practical limit. The bucket and registry enforce an independent
50 MiB ceiling. Oversized local data stays local while its record reports `metadata_only`; private
local packages are never published and do not inherit repository visibility.
