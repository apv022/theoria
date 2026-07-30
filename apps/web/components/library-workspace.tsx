"use client";

import { WorkerMcfEngine } from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import {
  type LearnerProgress,
  type LibraryEntry,
} from "@theoria/package-model";
import { localPackageId, toReaderStructure } from "@theoria/reader";
import { Button, LinkButton, Notice, Status } from "@theoria/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { SyncStatus } from "./sync-status";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

const download = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export function LibraryWorkspace() {
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const [entries, setEntries] = useState<readonly LibraryEntry[]>([]);
  const [progress, setProgress] = useState<
    Readonly<Record<string, LearnerProgress>>
  >({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [corrupt, setCorrupt] = useState<Readonly<Record<string, string>>>({});

  const refresh = useCallback(async () => {
    if (!store) {
      setError("IndexedDB is unavailable or blocked in this browser.");
      setLoading(false);
      return;
    }
    try {
      const list = await store.library.list();
      const progressValues = await Promise.all(
        list.map(
          async (entry) =>
            [
              entry.packageId,
              await store.progress.get(entry.packageId),
            ] as const,
        ),
      );
      const failures: Record<string, string> = {};
      await Promise.all(
        list.map(async (entry) => {
          try {
            await store.resolveLibrarySource(entry);
          } catch (reason) {
            failures[entry.packageId] =
              reason instanceof Error
                ? reason.message
                : "Corrupt local record.";
          }
        }),
      );
      setEntries(
        [...list].sort((a, b) => {
          const left = a.lastOpenedAt ?? a.addedAt;
          const right = b.lastOpenedAt ?? b.addedAt;
          return right.localeCompare(left);
        }),
      );
      const savedProgress: Record<string, LearnerProgress> = {};
      for (const [id, value] of progressValues) {
        if (value) savedProgress[id] = value;
      }
      setProgress(savedProgress);
      setCorrupt(failures);
      setError(undefined);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `Local library could not be opened: ${reason.message}`
          : "Local library could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void engine.initialize();
    void refresh();
    return () => engine.dispose();
  }, [engine, refresh]);

  const importArchive = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !store) return;
    setBusy(true);
    setError(undefined);
    setMessage("Validating package in the browser…");
    const worker = await engine.initialize();
    if (worker.status !== "ready") {
      setError(
        worker.status === "unsupported"
          ? worker.reason
          : worker.status === "fatal"
            ? worker.message
            : "The browser MCF engine could not start.",
      );
      setBusy(false);
      setMessage(undefined);
      return;
    }
    const requestId = crypto.randomUUID();
    const result = await engine.execute({
      type: "request",
      requestId,
      operation: "validate",
      input: {
        type: "archive",
        name: file.name,
        bytes: await file.arrayBuffer(),
      },
    });
    if (result.status !== "ok") {
      setError(
        result.status === "error"
          ? result.diagnostics.map((item) => item.message).join(" ")
          : result.status === "unsupported"
            ? result.reason
            : "Import was cancelled.",
      );
      setBusy(false);
      setMessage(undefined);
      return;
    }
    if (!toReaderStructure(result.readerPackage)) {
      setError(
        `${result.summary.manifest.kind} packages validate, but cannot be opened in the learner.`,
      );
      setBusy(false);
      setMessage(undefined);
      return;
    }
    const manifest = result.summary.manifest;
    const id = localPackageId(
      manifest.id,
      manifest.version,
      result.summary.sourceChecksum,
    );
    const timestamp = new Date().toISOString();
    try {
      await store.packages.put({
        id,
        manifest,
        archive: new Blob([result.sourceArchive], { type: "application/zip" }),
        sourceFilename: file.name,
        sourceChecksum: result.summary.sourceChecksum,
        archiveSize: result.summary.sourceSize,
        importedAt: timestamp,
        validation: result.validation,
      });
      await store.library.put({
        packageId: id,
        title: manifest.title,
        packageKind: manifest.kind,
        mcfVersion: manifest.mcf,
        version: manifest.version,
        addedAt: timestamp,
        origin: "imported",
        source: { type: "package", packageRecordId: id },
      });
      setMessage(`${manifest.title} was added to this browser.`);
      await refresh();
    } catch (reason) {
      const quota =
        reason instanceof DOMException &&
        (reason.name === "QuotaExceededError" ||
          reason.name === "NS_ERROR_DOM_QUOTA_REACHED");
      setError(
        quota
          ? "Browser storage quota was exceeded. Remove another local package and try again."
          : reason instanceof Error
            ? reason.message
            : "The package could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const restart = async (entry: LibraryEntry) => {
    if (
      !store ||
      !confirm(
        `Restart ${entry.title}? Saved responses and progress will be removed.`,
      )
    )
      return;
    await store.progress.delete(entry.packageId);
    await refresh();
  };

  const remove = async (entry: LibraryEntry) => {
    if (
      !store ||
      !confirm(`Remove ${entry.title} and its learning data from this browser?`)
    )
      return;
    await store.removeLearningPackage(entry);
    await refresh();
  };

  const exportSource = async (entry: LibraryEntry) => {
    if (!store) return;
    try {
      const source = await store.resolveLibrarySource(entry);
      download(source.archive, `${entry.packageId}.mcf.zip`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Source export failed.",
      );
    }
  };

  const exportCompiled = async (entry: LibraryEntry) => {
    if (!store) return;
    const source = await store.resolveLibrarySource(entry);
    if (source.compiledArtifact)
      download(source.compiledArtifact, `${entry.packageId}-compiled.zip`);
  };

  return (
    <div className="page-wrap library-page">
      <header className="page-heading split-heading">
        <div>
          <p className="section-label">Learning workspace</p>
          <h1>Your library</h1>
        </div>
        <div className="library-import">
          <Status tone="positive">Stored on this device</Status>
          <label className="button">
            {busy ? "Importing…" : "Add MCF package"}
            <input
              type="file"
              accept=".mcf.zip,application/zip"
              disabled={busy}
              onChange={(event) => void importArchive(event)}
            />
          </label>
        </div>
      </header>

      {message ? (
        <p className="library-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="storage-error" role="alert">
          <strong>Local library unavailable</strong>
          <p>{error}</p>
          <Button className="button-secondary" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="empty-state" aria-busy="true">
          <h2>Opening this browser’s library…</h2>
        </div>
      ) : entries.length ? (
        <div className="library-grid">
          {entries.map((entry) => {
            const state = progress[entry.packageId];
            const percentage = state
              ? Math.round(
                  (Object.values(state.lessons).filter(Boolean).length /
                    Math.max(1, Object.keys(state.lessons).length)) *
                    100,
                )
              : 0;
            const lesson = state?.currentLessonId;
            return (
              <article className="library-card" key={entry.packageId}>
                <div className="library-card-top">
                  <span>Θ</span>
                  <Status tone={state?.completedAt ? "positive" : "neutral"}>
                    {state?.completedAt ? "Complete" : `${percentage}%`}
                  </Status>
                  <SyncStatus category="library" stableId={entry.packageId} />
                </div>
                <p>
                  {entry.packageKind} · MCF {entry.mcfVersion} · v
                  {entry.version}
                </p>
                <h2>{entry.title}</h2>
                <div
                  className="library-progress"
                  aria-label={`${percentage}% complete`}
                >
                  <i style={{ width: `${percentage}%` }} />
                </div>
                {corrupt[entry.packageId] ? (
                  <p className="corrupt-record" role="alert">
                    {corrupt[entry.packageId]}
                  </p>
                ) : (
                  <LinkButton
                    href={
                      lesson
                        ? `/read/${encodeURIComponent(entry.packageId)}/${encodeURIComponent(lesson)}`
                        : `/read/${encodeURIComponent(entry.packageId)}`
                    }
                  >
                    {state ? "Continue learning" : "Start learning"}
                  </LinkButton>
                )}
                <details className="library-actions">
                  <summary>Package actions</summary>
                  <Button
                    className="button-secondary"
                    onClick={() => void exportSource(entry)}
                  >
                    Export source
                  </Button>
                  {entry.source.type === "compilation" ? (
                    <Button
                      className="button-secondary"
                      onClick={() => void exportCompiled(entry)}
                    >
                      Export compiled
                    </Button>
                  ) : null}
                  <Button
                    className="button-secondary"
                    onClick={() => void restart(entry)}
                  >
                    Restart progress
                  </Button>
                  <Button
                    className="button-danger"
                    onClick={() => void remove(entry)}
                  >
                    Remove package
                  </Button>
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true">
            ⌁
          </span>
          <h2>Your shelf is ready.</h2>
          <p>
            Add a valid MCF source archive here, or add a successful result from
            the compiler.
          </p>
          <LinkButton href="/compile" secondary>
            Open browser compiler
          </LinkButton>
        </div>
      )}

      <Notice title="Package data and progress stay separate">
        Removing or exporting a package is distinct from restarting responses
        and completion. Accounts are not required; future synchronization can
        build on these local records.
      </Notice>
    </div>
  );
}
