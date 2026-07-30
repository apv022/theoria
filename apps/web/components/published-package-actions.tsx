"use client";

import { WorkerMcfEngine } from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import { packageId, type LearnerProgress } from "@theoria/package-model";
import { localPackageId, toReaderStructure } from "@theoria/reader";
import { Button, LinkButton, Notice } from "@theoria/ui";
import { useEffect, useMemo, useState } from "react";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

export function PublishedPackageActions({
  slug,
  version,
  manifestId,
  manifestVersion,
  sourceChecksum,
}: {
  readonly slug: string;
  readonly version: string;
  readonly manifestId: string;
  readonly manifestVersion: string;
  readonly sourceChecksum: string;
}) {
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const localId = localPackageId(
    packageId(manifestId),
    manifestVersion,
    sourceChecksum,
  );
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [added, setAdded] = useState(false);
  const [otherVersion, setOtherVersion] = useState(false);
  const [progress, setProgress] = useState<LearnerProgress>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const sourceUrl = `/api/packages/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/source`;

  useEffect(() => {
    void (async () => {
      if (!store) return;
      const [entry, savedProgress, packages, library] = await Promise.all([
        store.library.get(localId),
        store.progress.get(localId),
        store.packages.list(),
        store.library.list(),
      ]);
      setAdded(Boolean(entry));
      setProgress(savedProgress);
      const libraryPackageIds = new Set(
        library
          .filter((item) => item.source.type === "package")
          .map((item) =>
            item.source.type === "package"
              ? item.source.packageRecordId
              : item.packageId,
          ),
      );
      setOtherVersion(
        packages.some(
          (item) =>
            item.id !== localId &&
            String(item.manifest.id) === manifestId &&
            libraryPackageIds.has(item.id),
        ),
      );
    })()
      .catch(() => setError("This browser’s library could not be inspected."))
      .finally(() => setChecking(false));
    return () => engine.dispose();
  }, [engine, localId, manifestId]);

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
      if (
        String(manifest.id) !== manifestId ||
        manifest.version !== manifestVersion ||
        result.summary.sourceChecksum !== sourceChecksum
      )
        throw new Error(
          "The downloaded source does not match this repository version.",
        );
      const at = new Date().toISOString();
      await store.packages.put({
        id: localId,
        manifest,
        archive: new Blob([result.sourceArchive], { type: "application/zip" }),
        sourceFilename: `${slug}-${version}.mcf.zip`,
        sourceChecksum: result.summary.sourceChecksum,
        archiveSize: result.summary.sourceSize,
        importedAt: at,
        validation: result.validation,
      });
      await store.library.put({
        packageId: localId,
        title: manifest.title,
        packageKind: manifest.kind,
        mcfVersion: manifest.mcf,
        version: manifest.version,
        addedAt: at,
        origin: "repository",
        source: { type: "package", packageRecordId: localId },
      });
      setAdded(true);
      setOtherVersion(false);
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

  const readerHref = progress?.currentLessonId
    ? `/read/${encodeURIComponent(localId)}/${encodeURIComponent(progress.currentLessonId)}`
    : `/read/${encodeURIComponent(localId)}`;

  return (
    <div className="published-actions">
      <a className="button button-secondary" href={sourceUrl}>
        Download canonical source
      </a>
      {added ? (
        <>
          <LinkButton href={readerHref}>
            {progress ? "Continue in Reader" : "Open in Reader"}
          </LinkButton>
          <Button
            className="button-secondary"
            disabled={busy}
            onClick={addToLibrary}
          >
            {busy ? "Revalidating…" : "Re-download and revalidate"}
          </Button>
        </>
      ) : (
        <Button disabled={busy || checking} onClick={addToLibrary}>
          {busy
            ? "Adding…"
            : checking
              ? "Checking local library…"
              : otherVersion
                ? "Add this version separately"
                : "Add to local library"}
        </Button>
      )}
      {otherVersion && !added ? (
        <Notice title="Another version is already local">
          Adding this release creates a separate local package and preserves
          progress for the older version.
        </Notice>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
