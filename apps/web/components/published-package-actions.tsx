"use client";

import { draftFromResult } from "@theoria/authoring";
import { WorkerMcfEngine } from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import {
  packageId,
  type LearnerProgress,
  type PackageDraft,
} from "@theoria/package-model";
import type { RepositoryNetwork } from "@theoria/platform-client";
import { localPackageId, toReaderStructure } from "@theoria/reader";
import { Button, LinkButton, Notice } from "@theoria/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-provider";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

export function PublishedPackageActions({
  slug,
  version,
  manifestId,
  manifestVersion,
  sourceChecksum,
  remotePackageId,
  remoteVersionId,
  title,
  creatorHandle,
  initialNetwork,
}: {
  readonly slug: string;
  readonly version: string;
  readonly manifestId: string;
  readonly manifestVersion: string;
  readonly sourceChecksum: string;
  readonly remotePackageId: string;
  readonly remoteVersionId: string;
  readonly title: string;
  readonly creatorHandle: string;
  readonly initialNetwork?: RepositoryNetwork | undefined;
}) {
  const router = useRouter();
  const { identity, platform } = useAuth();
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
  const [starred, setStarred] = useState(
    initialNetwork?.viewerStarred ?? false,
  );
  const [starCount, setStarCount] = useState(initialNetwork?.starCount ?? 0);
  const [starBusy, setStarBusy] = useState(false);
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

  const validatedSource = async () => {
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
    const manifest = result.summary.manifest;
    if (
      String(manifest.id) !== manifestId ||
      manifest.version !== manifestVersion ||
      result.summary.sourceChecksum !== sourceChecksum
    )
      throw new Error(
        "The downloaded source does not match this repository version.",
      );
    return result;
  };

  const addToLibrary = () => {
    if (!store) {
      setError("IndexedDB is unavailable in this browser.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setMessage("Downloading canonical source…");
    void (async () => {
      const result = await validatedSource();
      if (!toReaderStructure(result.readerPackage))
        throw new Error(
          `${result.summary.manifest.kind} packages cannot open in the learner.`,
        );
      const manifest = result.summary.manifest;
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

  const openInStudio = (fork: boolean) => {
    if (!store) {
      setError("IndexedDB is unavailable in this browser.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setMessage(
      fork
        ? "Creating an independent local fork…"
        : "Creating an editable local copy…",
    );
    void (async () => {
      const result = await validatedSource();
      const imported = draftFromResult(result, {
        imported: true,
        filename: `${slug}-${version}.mcf.zip`,
      });
      const draft: PackageDraft = fork
        ? {
            ...imported,
            origin: {
              packageId: remotePackageId,
              versionId: remoteVersionId,
              slug,
              version,
              title,
              creatorHandle,
              copiedAt: new Date().toISOString(),
            },
          }
        : imported;
      await store.drafts.put(draft);
      router.push(`/studio/${encodeURIComponent(draft.id)}`);
    })()
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "The editable copy could not be created.",
        ),
      )
      .finally(() => setBusy(false));
  };

  const toggleStar = () => {
    if (!identity) {
      router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    const previousStarred = starred;
    const previousCount = starCount;
    const next = !starred;
    setStarred(next);
    setStarCount(Math.max(0, starCount + (next ? 1 : -1)));
    setStarBusy(true);
    setError(undefined);
    void platform.repository
      .setStar(remotePackageId, next)
      .then((result) => {
        setStarred(result.starred);
        setStarCount(result.starCount);
      })
      .catch(() => {
        setStarred(previousStarred);
        setStarCount(previousCount);
        setError(
          "The star could not be updated. Your previous state was restored.",
        );
      })
      .finally(() => setStarBusy(false));
  };

  const readerHref = progress?.currentLessonId
    ? `/read/${encodeURIComponent(localId)}/${encodeURIComponent(progress.currentLessonId)}`
    : `/read/${encodeURIComponent(localId)}`;

  return (
    <div className="published-actions">
      <div className="repository-primary-action">
        {added ? (
          <LinkButton href={readerHref}>
            {progress ? "Continue learning" : "Start learning"}
          </LinkButton>
        ) : (
          <Button disabled={busy || checking} onClick={addToLibrary}>
            {busy
              ? "Adding…"
              : checking
                ? "Checking library…"
                : otherVersion
                  ? "Add this version to library"
                  : "Add to library"}
          </Button>
        )}
      </div>
      <div
        className="actions repository-utility-actions"
        aria-label="Course actions"
      >
        <Button
          className="button-secondary compact-action"
          disabled={starBusy || !initialNetwork}
          aria-pressed={starred}
          aria-label={`${starred ? "Remove star from" : "Star"} ${title}. ${starCount} stars`}
          onClick={toggleStar}
        >
          <span aria-hidden="true">{starred ? "★" : "☆"}</span>
          <span>{starBusy ? "Updating…" : starCount}</span>
        </Button>
        <a
          className="button button-secondary compact-action"
          href={sourceUrl}
          download={`${slug}-${version}.mcf.zip`}
          aria-label={`Download ${title} course file`}
        >
          <span aria-hidden="true">↓</span>
          <span>Download</span>
        </a>
      </div>
      <div className="actions repository-secondary-actions">
        <Button
          className="button-secondary"
          disabled={busy}
          onClick={() => openInStudio(false)}
        >
          {busy ? "Preparing…" : "Open in Creation Studio"}
        </Button>
        <Button
          className="button-secondary"
          disabled={busy}
          onClick={() => openInStudio(true)}
        >
          {busy
            ? "Preparing…"
            : initialNetwork
              ? `Fork into Creation Studio · ${initialNetwork.forkCount}`
              : "Fork into Creation Studio"}
        </Button>
      </div>
      {added ? (
        <Button
          className="button-secondary repository-refresh-action"
          disabled={busy}
          onClick={addToLibrary}
        >
          {busy ? "Revalidating…" : "Re-download course file"}
        </Button>
      ) : null}
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
