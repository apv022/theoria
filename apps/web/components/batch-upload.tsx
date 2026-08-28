"use client";

import { slug } from "@theoria/authoring";
import { duplicateReasons, mapWithConcurrency } from "@theoria/creation-tools";
import { WorkerMcfEngine, type EngineResult } from "@theoria/mcf-browser";
import type { PackageVisibility } from "@theoria/package-model";
import type {
  PublishedPackage,
  PublishingRequest,
} from "@theoria/platform-client";
import { Button, LinkButton, Status } from "@theoria/ui";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useAuth } from "./auth-provider";

type BatchStatus =
  | "inspecting"
  | "ready"
  | "invalid"
  | "unsupported"
  | "duplicate"
  | "publishing"
  | "published"
  | "failed";

interface BatchItem {
  readonly key: string;
  readonly file: File;
  readonly status: BatchStatus;
  readonly selected: boolean;
  readonly result?: Extract<EngineResult, { status: "ok" }>;
  readonly diagnostics: readonly string[];
  readonly reason?: string | undefined;
  readonly published?: { readonly slug: string; readonly version: string };
}

class ExistingVersionError extends Error {}

const statusLabel: Record<BatchStatus, string> = {
  inspecting: "Inspecting",
  ready: "Ready",
  invalid: "Invalid",
  unsupported: "Unsupported version",
  duplicate: "Duplicate",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
};

const classifyDuplicates = (
  items: readonly BatchItem[],
): readonly BatchItem[] => {
  const valid = items.flatMap((item) =>
    item.result && ["ready", "duplicate"].includes(item.status)
      ? [
          {
            key: item.key,
            checksum: item.result.summary.sourceChecksum,
            packageId: item.result.summary.manifest.id,
            version: item.result.summary.manifest.version,
          },
        ]
      : [],
  );
  const reasons = duplicateReasons(valid);
  return items.map((item) => {
    if (!item.result || !["ready", "duplicate"].includes(item.status))
      return item;
    const reason = reasons.get(item.key);
    return reason
      ? { ...item, status: "duplicate", selected: false, reason }
      : { ...item, status: "ready", reason: undefined };
  });
};

const errorsFor = (result: EngineResult): readonly string[] =>
  result.status === "error"
    ? result.diagnostics.map(
        (diagnostic) => `${diagnostic.file}: ${diagnostic.message}`,
      )
    : result.status === "unsupported"
      ? [result.reason, ...result.diagnostics.map((item) => item.message)]
      : result.status === "cancelled"
        ? ["Inspection was cancelled."]
        : [];

export function BatchUpload() {
  const { configured, identity, loading, platform } = useAuth();
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<readonly BatchItem[]>([]);
  const [visibility, setVisibility] = useState<PackageVisibility>("public");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    void engine.initialize();
    return () => engine.dispose();
  }, [engine]);

  const inspectFiles = async (files: readonly File[]) => {
    if (!files.length) return;
    setBusy(true);
    setMessage(undefined);
    const pending: BatchItem[] = files.map((file) => ({
      key: crypto.randomUUID(),
      file,
      status: "inspecting",
      selected: false,
      diagnostics: [],
    }));
    setItems((current) => [...current, ...pending]);
    const ready = await engine.initialize();
    if (ready.status !== "ready") {
      setItems((current) =>
        current.map((item) =>
          pending.some((entry) => entry.key === item.key)
            ? {
                ...item,
                status: "invalid",
                diagnostics: ["The browser MCF validator is unavailable."],
              }
            : item,
        ),
      );
      setBusy(false);
      return;
    }
    const inspected = await mapWithConcurrency(pending, 3, async (item) => {
      const result = await engine.execute({
        type: "request",
        requestId: item.key,
        operation: "inspect",
        input: {
          type: "archive",
          name: item.file.name,
          bytes: await item.file.arrayBuffer(),
        },
      });
      if (result.status === "ok")
        return {
          ...item,
          status: "ready" as const,
          selected: true,
          result,
        };
      return {
        ...item,
        status:
          result.status === "unsupported"
            ? ("unsupported" as const)
            : ("invalid" as const),
        diagnostics: errorsFor(result),
      };
    });
    setItems((current) => {
      const replacements = new Map(inspected.map((item) => [item.key, item]));
      return classifyDuplicates(
        current.map((item) => replacements.get(item.key) ?? item),
      );
    });
    setBusy(false);
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    void inspectFiles(files);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void inspectFiles([...event.dataTransfer.files]);
  };

  const updateItem = (key: string, update: Partial<BatchItem>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...update } : item)),
    );

  const ownedRepository = (
    item: BatchItem,
    repositories: readonly PublishedPackage[],
  ): PublishedPackage | undefined =>
    repositories.find((repository) =>
      repository.versions.some(
        (version) =>
          version.manifestSummary.id === item.result?.summary.manifest.id,
      ),
    );

  const publishOne = async (
    item: BatchItem,
    repositories: readonly PublishedPackage[],
  ) => {
    if (!item.result) return;
    updateItem(item.key, {
      status: "publishing",
      reason: undefined,
      diagnostics: [],
    });
    try {
      const repository = ownedRepository(item, repositories);
      const manifest = item.result.summary.manifest;
      if (
        repository?.versions.some(
          (version) => version.version === manifest.version,
        )
      )
        throw new ExistingVersionError(
          `Version ${manifest.version} already exists in ${repository.slug}.`,
        );
      const packageSlug = repository?.slug ?? slug(manifest.title);
      if (
        !repository &&
        !(await platform.publishing.slugAvailable(packageSlug))
      )
        throw new Error(
          `Repository slug ${packageSlug} is already in use. Open this package in Studio to choose another slug.`,
        );
      const request: PublishingRequest = {
        ...(repository ? { packageId: repository.id } : {}),
        slug: packageSlug,
        title: manifest.title,
        description: manifest.description ?? "",
        visibility: repository?.visibility ?? visibility,
        version: manifest.version,
        mcfVersion: manifest.mcf,
        packageKind: manifest.kind,
        sourceChecksum: item.result.summary.sourceChecksum,
        manifestSummary: {
          ...manifest,
          lessonCount: item.result.summary.lessonCount,
          activityCount: item.result.summary.activityCount,
          questionCount: item.result.summary.questionCount,
        },
        validationSummary: item.result.validation,
        releaseNotes: "Published through Batch Upload.",
        archive: new Blob([item.result.sourceArchive], {
          type: "application/zip",
        }),
      };
      const published = await platform.publishing.publish(request);
      updateItem(item.key, {
        status: "published",
        selected: false,
        published: { slug: published.slug, version: published.version },
      });
    } catch (reason) {
      updateItem(item.key, {
        status: reason instanceof ExistingVersionError ? "duplicate" : "failed",
        selected: false,
        reason: reason instanceof Error ? reason.message : "Publishing failed.",
      });
    }
  };

  const publish = async (targets: readonly BatchItem[]) => {
    if (!identity || !targets.length) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const firstPage = await platform.repository.listOwned(1, 24);
      const remainingPages = await mapWithConcurrency(
        Array.from(
          { length: Math.max(0, firstPage.totalPages - 1) },
          (_, index) => index + 2,
        ),
        3,
        (page) => platform.repository.listOwned(page, 24),
      );
      const repositories = [
        ...firstPage.packages,
        ...remainingPages.flatMap((page) => page.packages),
      ];
      await mapWithConcurrency(targets, 3, (item) =>
        publishOne(item, repositories),
      );
      setMessage("Batch finished. Successful packages were not republished.");
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Owned repositories could not be checked.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = (key: string) =>
    setItems((current) =>
      classifyDuplicates(current.filter((item) => item.key !== key)),
    );

  const counts = Object.fromEntries(
    Object.keys(statusLabel).map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  ) as Record<BatchStatus, number>;
  const selected = items.filter(
    (item) => item.status === "ready" && item.selected,
  );

  return (
    <main className="batch-page creation-tool-page">
      <header className="creation-tool-hero">
        <div>
          <p className="section-label">Creation · free · no AI required</p>
          <h1>Batch Upload</h1>
          <p>
            Inspect, validate, and publish a catalog of existing MCF packages
            through the normal Theoria pipeline.
          </p>
        </div>
        <Status tone={identity ? "positive" : "neutral"}>
          {identity
            ? `Signed in as @${identity.profile.handle}`
            : "Sign in to publish"}
        </Status>
      </header>

      <section className="batch-controls creation-panel">
        <div
          className={`batch-drop-zone${dragging ? " is-dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <span aria-hidden="true">⇧</span>
          <h2>Drop MCF packages here</h2>
          <p>
            MCF 1.1 ZIP source packages are validated locally before publishing.
          </p>
          <Button
            className="button-secondary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Select packages
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,.mcf.zip,application/zip"
            multiple
            hidden
            onChange={addFiles}
          />
        </div>
        <div className="batch-publish-controls">
          <label className="field">
            <span>Visibility for new repositories</span>
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as PackageVisibility)
              }
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </label>
          {!loading && !configured ? (
            <p>
              Accounts are not configured. Local validation remains available.
            </p>
          ) : null}
          {!loading && configured && !identity ? (
            <LinkButton href="/login?next=%2Fstudio%2Fbatch-upload">
              Sign in to publish
            </LinkButton>
          ) : null}
          <div className="actions">
            <Button
              disabled={busy || !identity || !selected.length}
              onClick={() => void publish(selected)}
            >
              Publish selected ({selected.length})
            </Button>
            <Button
              className="button-secondary"
              disabled={busy || !counts.failed}
              onClick={() =>
                void publish(items.filter((item) => item.status === "failed"))
              }
            >
              Retry failed ({counts.failed})
            </Button>
            <Button
              className="button-secondary"
              disabled={busy || !items.length}
              onClick={() => setItems([])}
            >
              Clear batch
            </Button>
          </div>
        </div>
      </section>

      {items.length ? (
        <section
          className="batch-results"
          aria-labelledby="batch-results-heading"
        >
          <div className="batch-summary">
            <div>
              <strong>{items.length}</strong>
              <span>packages</span>
            </div>
            <div>
              <strong>{counts.ready}</strong>
              <span>ready</span>
            </div>
            <div>
              <strong>{counts.invalid}</strong>
              <span>invalid</span>
            </div>
            <div>
              <strong>{counts.duplicate}</strong>
              <span>duplicate</span>
            </div>
            <div>
              <strong>{counts.unsupported}</strong>
              <span>unsupported</span>
            </div>
            <div>
              <strong>{counts.published}</strong>
              <span>published</span>
            </div>
          </div>
          <div className="studio-section-heading">
            <div>
              <p className="section-label">Local inspection</p>
              <h2 id="batch-results-heading">Package results</h2>
            </div>
            {message ? <p role="status">{message}</p> : null}
          </div>
          <div className="batch-table-wrap">
            <table className="batch-table">
              <thead>
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">Package</th>
                  <th scope="col">Identity</th>
                  <th scope="col">State</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.file.name}`}
                        checked={item.selected}
                        disabled={item.status !== "ready" || busy}
                        onChange={(event) =>
                          updateItem(item.key, {
                            selected: event.target.checked,
                          })
                        }
                      />
                    </td>
                    <td>
                      <strong>
                        {item.result?.summary.manifest.title ?? item.file.name}
                      </strong>
                      <small>
                        {item.file.name} · {(item.file.size / 1024).toFixed(1)}{" "}
                        KB
                      </small>
                    </td>
                    <td>
                      {item.result ? (
                        <>
                          <span>{item.result.summary.manifest.id}</span>
                          <small>
                            v{item.result.summary.manifest.version} · MCF{" "}
                            {item.result.summary.manifest.mcf}
                          </small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Status
                        tone={
                          item.status === "ready" || item.status === "published"
                            ? "positive"
                            : item.status === "invalid" ||
                                item.status === "failed"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {statusLabel[item.status]}
                      </Status>
                      {item.reason ? <small>{item.reason}</small> : null}
                    </td>
                    <td>
                      <div className="batch-row-actions">
                        {item.published ? (
                          <LinkButton
                            href={`/packages/${encodeURIComponent(item.published.slug)}`}
                          >
                            View package
                          </LinkButton>
                        ) : null}
                        <Button
                          className="button-secondary"
                          disabled={
                            busy ||
                            item.status === "publishing" ||
                            item.status === "published"
                          }
                          onClick={() => remove(item.key)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.some((item) => item.diagnostics.length) ? (
            <div className="batch-diagnostics">
              {items
                .filter((item) => item.diagnostics.length)
                .map((item) => (
                  <details key={item.key}>
                    <summary>{item.file.name} · validation details</summary>
                    <ul>
                      {item.diagnostics.map((diagnostic, index) => (
                        <li key={`${item.key}-${index}`}>{diagnostic}</li>
                      ))}
                    </ul>
                  </details>
                ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="batch-empty empty-state">
          <span className="empty-mark" aria-hidden="true">
            ⇧
          </span>
          <h2>No packages in this batch.</h2>
          <p>
            Add several MCF packages. One invalid file will not block the rest.
          </p>
        </section>
      )}
    </main>
  );
}
