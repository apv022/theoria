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
