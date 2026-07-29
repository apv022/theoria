"use client";

import {
  draftFromResult,
  draftInput,
  migrateDraft,
  newPackageFiles,
  regenerateFromPackage,
  slug,
} from "@theoria/authoring";
import {
  WorkerMcfEngine,
  type EngineResult,
  type ReaderPackage,
} from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import {
  draftId,
  type PackageDraft,
  type PackageKind,
} from "@theoria/package-model";
import { Button, LinkButton, Status } from "@theoria/ui";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const resultMessageForImport = (result: EngineResult): string =>
  result.status === "error"
    ? result.diagnostics.map((item) => item.message).join(" ")
    : result.status === "unsupported"
      ? result.reason
      : "Import was cancelled.";

export function StudioDashboard() {
  const router = useRouter();
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const directoryInput = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<readonly PackageDraft[]>([]);
  const [title, setTitle] = useState("Untitled package");
  const [kind, setKind] =
    useState<Extract<PackageKind, "course" | "module" | "lesson">>("course");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const refresh = useCallback(async () => {
    if (!store) {
      setError("IndexedDB is unavailable or blocked in this browser.");
      return;
    }
    const records = await store.drafts.list();
    setDrafts(
      records
        .map(migrateDraft)
        .filter((draft): draft is PackageDraft => Boolean(draft))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }, []);

  useEffect(() => {
    directoryInput.current?.setAttribute("webkitdirectory", "");
    void engine.initialize();
    void refresh();
    return () => engine.dispose();
  }, [engine, refresh]);

  const inspect = async (
    input: Parameters<WorkerMcfEngine["execute"]>[0]["input"],
  ) => {
    const ready = await engine.initialize();
    if (ready.status !== "ready")
      throw new Error(
        ready.status === "unsupported"
          ? ready.reason
          : ready.status === "fatal"
            ? ready.message
            : "The browser MCF engine could not start.",
      );
    return engine.execute({
      type: "request",
      requestId: crypto.randomUUID(),
      operation: "inspect",
      input,
    });
  };

  const create = async () => {
    if (!store) return;
    setBusy(true);
    setError(undefined);
    const id = slug(title);
    const files = newPackageFiles(kind, title.trim() || "Untitled package", id);
    const result = await inspect({
      type: "directory",
      name: title,
      files: files.map((file) => ({ path: file.path, bytes: file.bytes })),
    });
    if (result.status !== "ok") {
      setError(
        result.status === "error"
          ? result.diagnostics.map((item) => item.message).join(" ")
          : result.status === "unsupported"
            ? result.reason
            : "Creation was cancelled.",
      );
      setBusy(false);
      return;
    }
    const draft = draftFromResult(result);
    await store.drafts.put(draft);
    router.push(`/studio/${encodeURIComponent(draft.id)}`);
  };

  const importPackage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !store) return;
    setBusy(true);
    setError(undefined);
    const result = await inspect({
      type: "archive",
      name: file.name,
      bytes: await file.arrayBuffer(),
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
      return;
    }
    const draft = draftFromResult(result, {
      imported: true,
      filename: file.name,
    });
    try {
      await store.drafts.put(draft);
      setMessage(`${draft.title} was imported without rewriting its source.`);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof DOMException && reason.name === "QuotaExceededError"
          ? "Browser storage quota was exceeded."
          : reason instanceof Error
            ? reason.message
            : "The draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const importDirectory = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length || !store) return;
    setBusy(true);
    setError(undefined);
    const root =
      files[0]?.webkitRelativePath.split("/")[0] || "Selected directory";
    const result = await inspect({
      type: "directory",
      name: root,
      files: await Promise.all(
        files.map(async (file) => ({
          path: file.webkitRelativePath || file.name,
          bytes: await file.arrayBuffer(),
        })),
      ),
    });
    if (result.status !== "ok") {
      setError(resultMessageForImport(result));
      setBusy(false);
      return;
    }
    const draft = draftFromResult(result, {
      imported: true,
      filename: root,
    });
    await store.drafts.put(draft);
    setMessage(`${draft.title} was imported without rewriting its source.`);
    await refresh();
    setBusy(false);
  };

  const exportDraft = async (draft: PackageDraft) => {
    const result = await inspect(draftInput(draft));
    if (result.status === "ok")
      download(
        new Blob([result.sourceArchive], { type: "application/zip" }),
        `${slug(draft.title)}.mcf.zip`,
      );
    else setError("The current source must validate before export.");
  };

  const rename = async (draft: PackageDraft) => {
    if (!store) return;
    const value = prompt("Package title", draft.title)?.trim();
    if (!value || value === draft.title) return;
    try {
      const pkg = structuredClone(draft.normalizedPackage) as
        | ReaderPackage
        | undefined;
      const next =
        pkg && draft.visualEditing === "supported"
          ? regenerateFromPackage(
              draft,
              Object.assign(pkg, { title: value }),
              "Rename package",
            )
          : { ...draft, title: value, updatedAt: new Date().toISOString() };
      await store.drafts.put(next);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Rename failed.");
    }
  };

  const duplicate = async (draft: PackageDraft) => {
    if (!store) return;
    const at = new Date().toISOString();
    const cloned = structuredClone(draft);
    const { latestCompilationId: _latestCompilationId, ...withoutPreview } =
      cloned;
    void _latestCompilationId;
    const copy: PackageDraft = {
      ...withoutPreview,
      id: draftId(crypto.randomUUID()),
      title: `${draft.title} copy`,
      createdAt: at,
      updatedAt: at,
      revision: 0,
      commands: [],
    };
    await store.drafts.put(copy);
    await refresh();
  };

  return (
    <div className="studio-home studio-dashboard">
      <header>
        <p className="section-label">Local-first creation</p>
        <h1>Creation Studio</h1>
        <p>
          Build, validate, preview, and export portable MCF without an account.
        </p>
      </header>

      {error ? (
        <div className="storage-error" role="alert">
          <strong>Studio unavailable</strong>
          <p>{error}</p>
          <Button className="button-secondary" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      {message ? (
        <p className="library-message" role="status">
          {message}
        </p>
      ) : null}

      <section className="studio-create" aria-labelledby="create-heading">
        <div>
          <p className="section-label">New package</p>
          <h2 id="create-heading">Start with valid MCF 1.1 source.</h2>
        </div>
        <label className="field">
          <span>Package title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Package kind</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="course">Course</option>
            <option value="module">Module</option>
            <option value="lesson">Lesson</option>
          </select>
        </label>
        <div className="actions">
          <Button
            disabled={busy || !title.trim()}
            onClick={() => void create()}
          >
            Create package
          </Button>
          <label className="button button-secondary">
            {busy ? "Working…" : "Import MCF package"}
            <input
              type="file"
              accept=".zip,.mcf.zip,application/zip"
              disabled={busy}
              onChange={(event) => void importPackage(event)}
            />
          </label>
          <label className="button button-secondary">
            Import package directory
            <input
              ref={directoryInput}
              type="file"
              multiple
              disabled={busy}
              onChange={(event) => void importDirectory(event)}
            />
          </label>
        </div>
      </section>

      <section className="studio-recents" aria-labelledby="recent-heading">
        <div className="studio-section-heading">
          <div>
            <p className="section-label">On this device</p>
            <h2 id="recent-heading">Recent drafts</h2>
          </div>
          <Status tone="positive">{drafts.length} local</Status>
        </div>
        {drafts.length ? (
          <div className="draft-card-grid">
            {drafts.map((draft) => (
              <article className="draft-card" key={draft.id}>
                <div>
                  <Status
                    tone={
                      draft.validation.state === "valid"
                        ? "positive"
                        : draft.validation.state === "invalid"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {draft.validation.state}
                  </Status>
                  <span>
                    {draft.kind} · MCF {draft.mcf}
                  </span>
                </div>
                <h3>{draft.title}</h3>
                <p>
                  Edited {new Date(draft.updatedAt).toLocaleString()} · revision{" "}
                  {draft.revision}
                </p>
                <LinkButton href={`/studio/${encodeURIComponent(draft.id)}`}>
                  Open draft
                </LinkButton>
                <details>
                  <summary>Draft actions</summary>
                  <Button
                    className="button-secondary"
                    onClick={() => void rename(draft)}
                  >
                    Rename
                  </Button>
                  <Button
                    className="button-secondary"
                    onClick={() => void duplicate(draft)}
                  >
                    Duplicate
                  </Button>
                  <Button
                    className="button-secondary"
                    onClick={() => void exportDraft(draft)}
                  >
                    Export source
                  </Button>
                  {draft.originalSourceArchive ? (
                    <Button
                      className="button-secondary"
                      onClick={() =>
                        download(
                          draft.originalSourceArchive!,
                          draft.originalFilename ??
                            `${slug(draft.title)}-original.mcf.zip`,
                        )
                      }
                    >
                      Export original import
                    </Button>
                  ) : null}
                  <Button
                    className="button-danger"
                    onClick={() => {
                      if (
                        store &&
                        confirm(`Delete “${draft.title}” from this browser?`)
                      )
                        void store.drafts.delete(draft.id).then(refresh);
                    }}
                  >
                    Delete
                  </Button>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              ✦
            </span>
            <h2>No drafts yet.</h2>
            <p>Create a package or import a validated source archive.</p>
          </div>
        )}
      </section>
    </div>
  );
}
