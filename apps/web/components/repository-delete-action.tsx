"use client";

import { Button } from "@theoria/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";

export function RepositoryDeleteAction({
  packageId,
  ownerId,
  slug,
}: {
  readonly packageId: string;
  readonly ownerId: string;
  readonly slug: string;
}) {
  const router = useRouter();
  const { identity, platform } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!identity || identity.id !== ownerId) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setConfirmation("");
    setError(undefined);
  };

  const submit = () => {
    if (busy || confirmation !== slug) return;
    setBusy(true);
    setError(undefined);
    void platform.repository
      .softDeleteRepository(packageId)
      .then(() => {
        router.replace("/repositories");
        router.refresh();
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "The repository could not be removed. Nothing was changed.",
        );
        setBusy(false);
      });
  };

  return (
    <section className="repository-danger-zone" aria-labelledby="danger-title">
      <p className="section-label">Danger area</p>
      <h2 id="danger-title">Delete repository</h2>
      <p>
        Remove this repository from Theoria. Published history and source data
        may be retained internally to preserve repository integrity.
      </p>
      {!open ? (
        <Button className="button-danger" onClick={() => setOpen(true)}>
          Delete repository
        </Button>
      ) : (
        <div
          className="repository-delete-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <h3 id="delete-dialog-title">
            Delete {slug} permanently from Theoria?
          </h3>
          <p>
            This hides the repository from browsing, search, profiles, and your
            repositories. Immutable versions, lineage, stars, and source
            archives are retained; this is a soft delete, not physical erasure.
          </p>
          <label htmlFor="delete-repository-confirmation">
            Type <strong>{slug}</strong> to confirm.
          </label>
          <input
            id="delete-repository-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
          <div className="actions">
            <Button
              className="button-danger"
              disabled={busy || confirmation !== slug}
              onClick={submit}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button
              className="button-secondary"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
