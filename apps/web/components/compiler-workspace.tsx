"use client";

import {
  WorkerMcfEngine,
  type EngineOperation,
  type EngineProgress,
  type EngineResult,
  type PackageInput,
} from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import type {
  CompilationRecord,
  ValidationDiagnostic,
} from "@theoria/package-model";
import { localPackageId } from "@theoria/reader";
import { Button, Status } from "@theoria/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { SyncStatus } from "./sync-status";
import { CompilerReaderPreview } from "./reader-experience";

type SelectedSource =
  | { readonly type: "archive"; readonly file: File }
  | {
      readonly type: "directory";
      readonly name: string;
      readonly files: readonly File[];
    };

interface Output {
  readonly result: Extract<EngineResult, { status: "ok" }>;
  readonly sourceName: string;
  readonly compilationId?: string;
}

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

const inputFromSource = async (
  source: SelectedSource,
): Promise<PackageInput> => {
  if (source.type === "archive") {
    return {
      type: "archive",
      name: source.file.name,
      bytes: await source.file.arrayBuffer(),
    };
  }
  return {
    type: "directory",
    name: source.name,
    files: await Promise.all(
      source.files.map(async (file) => ({
        path: file.webkitRelativePath || file.name,
        bytes: await file.arrayBuffer(),
      })),
    ),
  };
};

const download = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const groupDiagnostics = (items: readonly ValidationDiagnostic[]) =>
  (["error", "warning", "info"] as const)
    .map((severity) => ({
      severity,
      items: items.filter((item) => item.severity === severity),
    }))
    .filter((group) => group.items.length);

export function CompilerWorkspace() {
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const directoryInput = useRef<HTMLInputElement>(null);
  const [engineStatus, setEngineStatus] = useState("Starting worker…");
  const [source, setSource] = useState<SelectedSource>();
  const [running, setRunning] = useState<{
    readonly id: string;
    readonly operation: EngineOperation;
  }>();
  const [progress, setProgress] = useState<EngineProgress>();
  const [result, setResult] = useState<EngineResult>();
  const [output, setOutput] = useState<Output>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [history, setHistory] = useState<readonly CompilationRecord[]>([]);
  const [dragging, setDragging] = useState(false);
  const lastOperation = useRef<EngineOperation>("validate");

  const refreshHistory = useCallback(async () => {
    const records = await store?.compilations.list();
    setHistory(
      [...(records ?? [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
  }, []);

  useEffect(() => {
    directoryInput.current?.setAttribute("webkitdirectory", "");
    void engine.initialize().then((state) => {
      setEngineStatus(
        state.status === "ready"
          ? "Worker ready · MCF 1.0 + 1.1"
          : state.status === "unsupported" || state.status === "fatal"
            ? state.status === "unsupported"
              ? state.reason
              : state.message
            : "Worker unavailable",
      );
    });
    void refreshHistory();
    return () => engine.dispose();
  }, [engine, refreshHistory]);

  const chooseArchive = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSource({ type: "archive", file });
      setResult(undefined);
      setOutput(undefined);
      setPreviewOpen(false);
    }
    event.target.value = "";
  };

  const chooseDirectory = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (files.length) {
      const root =
        files[0]?.webkitRelativePath.split("/")[0] || "Selected directory";
      setSource({ type: "directory", name: root, files });
      setResult(undefined);
      setOutput(undefined);
      setPreviewOpen(false);
    }
    event.target.value = "";
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      setSource({ type: "archive", file });
      setResult(undefined);
      setOutput(undefined);
      setPreviewOpen(false);
    }
  };

  const run = useCallback(
    async (operation: EngineOperation) => {
      if (!source || running) return;
      lastOperation.current = operation;
      const requestId = crypto.randomUUID();
      setRunning({ id: requestId, operation });
      setProgress(undefined);
      setResult(undefined);
      setOutput(undefined);
      setPreviewOpen(false);
      const input = await inputFromSource(source);
      const value = await engine.execute(
        { type: "request", requestId, operation, input },
        setProgress,
      );
      setResult(value);
      setRunning(undefined);
      if (value.status !== "ok") return;
      const sourceName =
        source.type === "archive" ? source.file.name : `${source.name}.mcf.zip`;
      setOutput({ result: value, sourceName });
      if (value.compiledArtifact) {
        const now = new Date().toISOString();
        const record: CompilationRecord = {
          id: crypto.randomUUID(),
          sourceFilename: sourceName,
          identity: {
            id: value.summary.manifest.id,
            title: value.summary.manifest.title,
            version: value.summary.manifest.version,
          },
          packageKind: value.summary.manifest.kind,
          mcfVersion: value.summary.manifest.mcf,
          sourceChecksum: value.summary.sourceChecksum,
          sourceArchive: new Blob([value.sourceArchive], {
            type: "application/zip",
          }),
          compiledArtifact: new Blob([value.compiledArtifact], {
            type: "application/zip",
          }),
          validation: value.validation,
          diagnostics: value.diagnostics,
          createdAt: now,
          updatedAt: now,
          syncState: "local",
        };
        await store?.compilations.put(record);
        setOutput({ result: value, sourceName, compilationId: record.id });
        await refreshHistory();
      }
    },
    [engine, refreshHistory, running, source],
  );

  const cancel = () => {
    if (running) engine.cancel(running.id);
    setRunning(undefined);
    setProgress(undefined);
  };

  const reopen = async (record: CompilationRecord) => {
    const artifact = await record.compiledArtifact.arrayBuffer();
    const sourceArchive = record.sourceArchive
      ? await record.sourceArchive.arrayBuffer()
      : new ArrayBuffer(0);
    const synthetic: Extract<EngineResult, { status: "ok" }> = {
      requestId: record.id,
      status: "ok",
      operation: "compile",
      summary: {
        manifest: {
          mcf: record.mcfVersion,
          kind: record.packageKind,
          id: record.identity.id,
          title: record.identity.title,
          language: "und",
          version: record.identity.version,
          authors: [],
        },
        lessonCount: 0,
        activityCount: 0,
        questionCount: 0,
        sourceChecksum: record.sourceChecksum,
        sourceSize: sourceArchive.byteLength,
      },
      readerPackage: {
        mcf: record.mcfVersion,
        kind: record.packageKind,
        id: record.identity.id,
        title: record.identity.title,
        language: "und",
        version: record.identity.version,
        root: "/package",
        diagnostics: [],
        sourceType: "archive",
        ...(record.packageKind === "course"
          ? { chapters: [] }
          : record.packageKind === "module"
            ? { lessons: [] }
            : record.packageKind === "lesson"
              ? {
                  entry: "",
                  lesson: {
                    id: "unavailable",
                    title: "Unavailable",
                    source: "",
                    activities: [],
                  },
                }
              : record.packageKind === "question_bank"
                ? { entry: "", questions: [] }
                : {}),
      } as Extract<EngineResult, { status: "ok" }>["readerPackage"],
      sourceFiles: [],
      validation: record.validation,
      diagnostics: record.diagnostics,
      sourceArchive,
      compiledArtifact: artifact,
    };
    setOutput({
      result: synthetic,
      sourceName: record.sourceFilename,
      compilationId: record.id,
    });
    setResult(synthetic);
    setPreviewOpen(false);
  };

  const addOutputToLibrary = async () => {
    if (!output?.compilationId || !store) return;
    const manifest = output.result.summary.manifest;
    const id = localPackageId(
      manifest.id,
      manifest.version,
      output.result.summary.sourceChecksum,
    );
    await store.library.put({
      packageId: id,
      title: manifest.title,
      packageKind: manifest.kind,
      mcfVersion: manifest.mcf,
      version: manifest.version,
      addedAt: new Date().toISOString(),
      origin: "imported",
      source: {
        type: "compilation",
        compilationId: output.compilationId,
      },
    });
  };

  const diagnostics =
    result && "diagnostics" in result ? result.diagnostics : [];
  return (
    <div className="compiler-workspace">
      <header className="compiler-intro">
        <div>
          <p className="section-label">Import · validate · compile</p>
          <h1>Compile in the browser.</h1>
          <p>
            Your package stays on this device. Parsing, validation, and
            compilation run in a dedicated worker.
          </p>
        </div>
        <Status tone={engine.state.status === "ready" ? "positive" : "warning"}>
          {engineStatus}
        </Status>
      </header>

      <section
        className="compiler-panel import-panel"
        aria-labelledby="source-heading"
      >
        <div className="panel-heading">
          <span>01</span>
          <div>
            <p>Source</p>
            <h2 id="source-heading">Choose a package</h2>
          </div>
        </div>
        <div
          className={`drop-zone${dragging ? " dragging" : ""}`}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={drop}
        >
          <strong>Drop an .mcf.zip here</strong>
          <p>or choose a portable archive or package directory</p>
          <div className="actions">
            <label className="button">
              Choose archive
              <input
                type="file"
                accept=".mcf.zip,application/zip"
                onChange={chooseArchive}
              />
            </label>
            <label className="button button-secondary">
              Choose directory
              <input
                ref={directoryInput}
                type="file"
                multiple
                onChange={chooseDirectory}
              />
            </label>
          </div>
        </div>
        {source ? (
          <div className="source-summary">
            <div>
              <span>Selected source</span>
              <strong>
                {source.type === "archive" ? source.file.name : source.name}
              </strong>
            </div>
            <div>
              <span>Input type</span>
              <strong>
                {source.type === "archive"
                  ? "MCF ZIP archive"
                  : `${source.files.length} directory files`}
              </strong>
            </div>
            <div>
              <span>Execution</span>
              <strong>Local Web Worker</strong>
            </div>
          </div>
        ) : null}
      </section>

      <section
        className="compiler-panel action-panel"
        aria-labelledby="action-heading"
      >
        <div className="panel-heading">
          <span>02</span>
          <div>
            <p>Process</p>
            <h2 id="action-heading">Validate or compile</h2>
          </div>
        </div>
        <div className="actions">
          <Button
            disabled={!source || Boolean(running)}
            onClick={() => void run("validate")}
          >
            Validate only
          </Button>
          <Button
            disabled={!source || Boolean(running)}
            onClick={() => void run("compile")}
          >
            Compile package
          </Button>
          {running ? (
            <Button className="button-danger" onClick={cancel}>
              Cancel
            </Button>
          ) : null}
          {result?.status === "error" ? (
            <Button
              className="button-secondary"
              onClick={() => void run(lastOperation.current)}
            >
              Retry
            </Button>
          ) : null}
        </div>
        {running && progress ? (
          <div className="compile-progress" role="status" aria-live="polite">
            <div>
              <strong>{progress.message}</strong>
              <span>{progress.completed}%</span>
            </div>
            <progress max={100} value={progress.completed}>
              {progress.completed}%
            </progress>
          </div>
        ) : null}
      </section>

      {result ? (
        <section
          className="compiler-panel results-panel"
          aria-labelledby="results-heading"
        >
          <div className="panel-heading">
            <span>03</span>
            <div>
              <p>Result</p>
              <h2 id="results-heading">
                {result.status === "ok"
                  ? "Package ready"
                  : result.status === "cancelled"
                    ? "Cancelled"
                    : "Needs attention"}
              </h2>
            </div>
          </div>
          {result.status === "ok" ? (
            <>
              <div className="result-facts">
                <div>
                  <span>Package</span>
                  <strong>{result.summary.manifest.title}</strong>
                </div>
                <div>
                  <span>Format</span>
                  <strong>
                    MCF {result.summary.manifest.mcf} ·{" "}
                    {result.summary.manifest.kind}
                  </strong>
                </div>
                <div>
                  <span>Structure</span>
                  <strong>
                    {result.summary.lessonCount} lessons ·{" "}
                    {result.summary.activityCount} activities ·{" "}
                    {result.summary.questionCount} questions
                  </strong>
                </div>
                <div>
                  <span>Validation</span>
                  <Status tone="positive">Valid</Status>
                </div>
              </div>
              <div className="actions">
                {output?.result.sourceFiles.length ? (
                  <Button onClick={() => setPreviewOpen(true)}>
                    Preview in Reader
                  </Button>
                ) : null}
                {output ? (
                  <Button
                    className="button-secondary"
                    onClick={() =>
                      download(
                        new Blob([output.result.sourceArchive], {
                          type: "application/zip",
                        }),
                        output.sourceName,
                      )
                    }
                  >
                    Download source
                  </Button>
                ) : null}
                {output?.result.compiledArtifact ? (
                  <Button
                    onClick={() =>
                      download(
                        new Blob([output.result.compiledArtifact!], {
                          type: "application/zip",
                        }),
                        `${output.result.summary.manifest.id}-compiled.zip`,
                      )
                    }
                  >
                    Download compiled ZIP
                  </Button>
                ) : null}
                {output?.compilationId ? (
                  <Button
                    className="button-secondary"
                    onClick={() => void addOutputToLibrary()}
                  >
                    Add to library
                  </Button>
                ) : null}
              </div>
            </>
          ) : result.status === "unsupported" ? (
            <p>{result.reason}</p>
          ) : null}
          {groupDiagnostics(diagnostics).map((group) => (
            <div
              className={`diagnostic-group diagnostics-${group.severity}`}
              key={group.severity}
            >
              <h3>
                {group.severity} · {group.items.length}
              </h3>
              <ul>
                {group.items.map((item, index) => (
                  <li key={`${item.code}-${index}`}>
                    <code>{item.code}</code>
                    <strong>
                      {item.file}
                      {item.line
                        ? `:${item.line}${item.column ? `:${item.column}` : ""}`
                        : ""}
                    </strong>
                    <span>{item.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {previewOpen && output ? (
        <section
          className="compiler-reader-preview"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compiler-reader-preview-heading"
        >
          <header>
            <div>
              <p className="section-label">Reader preview</p>
              <h2 id="compiler-reader-preview-heading">
                {output.result.summary.manifest.title}
              </h2>
            </div>
            <Button
              className="button-secondary"
              onClick={() => setPreviewOpen(false)}
            >
              Close preview
            </Button>
          </header>
          <CompilerReaderPreview
            readerPackage={output.result.readerPackage}
            sourceFiles={output.result.sourceFiles}
            sourceChecksum={output.result.summary.sourceChecksum}
          />
        </section>
      ) : null}

      <section
        className="compiler-panel history-panel"
        aria-labelledby="history-heading"
      >
        <div className="panel-heading">
          <span>05</span>
          <div>
            <p>IndexedDB</p>
            <h2 id="history-heading">Compilation history</h2>
          </div>
        </div>
        {history.length ? (
          <ul>
            {history.map((record) => (
              <li key={record.id}>
                <div>
                  <strong>{record.identity.title}</strong>
                  <span>
                    {new Date(record.createdAt).toLocaleString()} · MCF{" "}
                    {record.mcfVersion}
                  </span>
                </div>
                <Button
                  className="button-secondary"
                  onClick={() => void reopen(record)}
                >
                  Reopen
                </Button>
                <SyncStatus category="compilation" stableId={record.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Successful compilations will appear here and remain on this device.
          </p>
        )}
      </section>
    </div>
  );
}
