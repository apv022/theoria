"use client";

import { WorkerMcfEngine } from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import { localPackageId, toReaderStructure } from "@theoria/reader";
import { Button } from "@theoria/ui";
import { useMemo, useState } from "react";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

export function PublishedPackageActions({
  slug,
  version,
}: {
  readonly slug: string;
  readonly version: string;
}) {
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const sourceUrl = `/api/packages/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/source`;

  const addToLibrary = () => {
    if (!store) {
      setError("IndexedDB is unavailable in this browser.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setMessage("Downloading canonical source…");
    void (async () => {
      const response = await fetch(sourceUrl);
      if (!response.ok)
        throw new Error("Source download is unavailable for this account.");
      const archive = await response.blob();
      setMessage("Validating source in the real browser engine…");
      const ready = await engine.initialize();
      if (ready.status !== "ready")
        throw new Error("The browser MCF engine is unavailable.");
      const result = await engine.execute({
        type: "request",
        requestId: crypto.randomUUID(),
        operation: "validate",
        input: {
          type: "archive",
          name: `${slug}-${version}.mcf.zip`,
          bytes: await archive.arrayBuffer(),
        },
      });
      if (result.status !== "ok")
        throw new Error(
          result.status === "error"
            ? result.diagnostics.map((item) => item.message).join(" ")
            : result.status === "unsupported"
              ? result.reason
              : "Validation was cancelled.",
        );
      if (!toReaderStructure(result.readerPackage))
        throw new Error(
          `${result.summary.manifest.kind} packages cannot open in the learner.`,
        );
      const manifest = result.summary.manifest;
      const id = localPackageId(
        manifest.id,
        manifest.version,
        result.summary.sourceChecksum,
      );
      const at = new Date().toISOString();
      await store.packages.put({
        id,
        manifest,
        archive: new Blob([result.sourceArchive], { type: "application/zip" }),
        sourceFilename: `${slug}-${version}.mcf.zip`,
        sourceChecksum: result.summary.sourceChecksum,
        archiveSize: result.summary.sourceSize,
        importedAt: at,
        validation: result.validation,
      });
      await store.library.put({
        packageId: id,
        title: manifest.title,
        packageKind: manifest.kind,
        mcfVersion: manifest.mcf,
        version: manifest.version,
        addedAt: at,
        origin: "repository",
        source: { type: "package", packageRecordId: id },
      });
      setMessage(`${manifest.title} was added to this browser.`);
    })()
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "The package could not be added.",
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="published-actions">
      <a className="button button-secondary" href={sourceUrl}>
        Download canonical source
      </a>
      <Button disabled={busy} onClick={addToLibrary}>
        {busy ? "Adding…" : "Add to local library"}
      </Button>
      {message ? <p role="status">{message}</p> : null}
      {error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
