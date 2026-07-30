"use client";

import {
  IndexedDbLocalStore,
  type LocalSyncConflict,
  type LocalSyncCounts,
  type LocalSyncOutboxOperation,
  type LocalSyncRecord,
  type LocalSyncSettings,
} from "@theoria/local-store";
import { draftId, packageId } from "@theoria/package-model";
import type { RemoteSyncCounts } from "@theoria/platform-client";
import {
  SYNC_ARTIFACT_LIMIT,
  TheoriaSyncEngine,
  type SyncOnboardingChoice,
  type SyncPlan,
  type SyncProgress,
} from "@theoria/sync";
import { Button, LinkButton, Notice, Status } from "@theoria/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

const emptyCounts: LocalSyncCounts = {
  drafts: 0,
  library: 0,
  progress: 0,
  compilations: 0,
  localPackages: 0,
};

const emptyRemote: RemoteSyncCounts = {
  drafts: 0,
  library: 0,
  progress: 0,
  compilations: 0,
  localPackages: 0,
  blobs: 0,
  storageBytes: 0,
};

const countRows = (
  local: LocalSyncCounts,
  remote: RemoteSyncCounts,
): readonly [string, number, number][] => [
  ["Local drafts", local.drafts, remote.drafts],
  ["Library entries", local.library, remote.library],
  ["Progress records", local.progress, remote.progress],
  ["Compilation records", local.compilations, remote.compilations],
  ["Private local packages", local.localPackages, remote.localPackages],
];

const date = (value?: string): string =>
  value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Never";

export function SyncSettings() {
  const { configured, event, identity, loading, platform } = useAuth();
  const engine = useMemo(
    () =>
      store ? new TheoriaSyncEngine(store.sync, platform.sync) : undefined,
    [platform],
  );
  const controller = useRef<AbortController | undefined>(undefined);
  const [settings, setSettings] = useState<LocalSyncSettings>();
  const [plan, setPlan] = useState<SyncPlan>();
  const [records, setRecords] = useState<readonly LocalSyncRecord[]>([]);
  const [outbox, setOutbox] = useState<readonly LocalSyncOutboxOperation[]>([]);
  const [conflicts, setConflicts] = useState<readonly LocalSyncConflict[]>([]);
  const [progress, setProgress] = useState<SyncProgress>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!store || !engine || !identity) return;
    const [nextSettings, nextPlan, nextRecords, nextOutbox, nextConflicts] =
      await Promise.all([
        store.sync.settings(),
        engine.plan(identity.id),
        store.sync.records(),
        store.sync.outbox(),
        store.sync.conflicts(),
      ]);
    setSettings(nextSettings);
    setPlan(nextPlan);
    setRecords(nextRecords);
    setOutbox(nextOutbox);
    setConflicts(nextConflicts);
  }, [engine, identity]);

  useEffect(() => {
    const changed = () => void refresh();
    void refresh();
    addEventListener("theoria-sync-change", changed);
    return () => removeEventListener("theoria-sync-change", changed);
  }, [refresh]);

  const run = async (choice?: SyncOnboardingChoice) => {
    if (!engine || !identity || !store) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const activeController = new AbortController();
    controller.current = activeController;
    try {
      const result = choice
        ? await engine.enable(choice, identity.id, "This browser", {
            signal: activeController.signal,
            onProgress: setProgress,
          })
        : await (async () => {
            await store.sync.configure({ pausedReason: undefined });
            return engine.syncNow({
              signal: activeController.signal,
              onProgress: setProgress,
            });
          })();
      setMessage(
        choice === "local-only"
          ? "This device remains local-only. Nothing was uploaded."
          : `Sync complete: ${result?.uploaded ?? 0} uploaded, ${result?.downloaded ?? 0} downloaded, ${result?.conflicts ?? 0} conflicts.`,
      );
    } catch (reason) {
      setError(
        reason instanceof DOMException && reason.name === "AbortError"
          ? "Synchronization paused between records. Queued work is preserved."
          : reason instanceof Error
            ? reason.message
            : "Synchronization failed.",
      );
    } finally {
      controller.current = undefined;
      setBusy(false);
      await refresh();
    }
  };

  const deleteConflictCopy = async (conflict: LocalSyncConflict) => {
    if (!conflict.conflictCopyId) return;
    await store?.sync.applyRemote(
      conflict.category,
      conflict.conflictCopyId,
      undefined,
      {
        remoteRevision: 0,
        resetGeneration: 0,
        deleted: true,
        artifactStatus: "available",
        updatedAt: new Date().toISOString(),
        deviceId: conflict.remoteDeviceId,
      },
    );
    await store?.sync.deleteConflict(conflict.id);
    setMessage("Conflict copy deleted from this device.");
    await refresh();
  };

  const deletePrimaryCopy = async (conflict: LocalSyncConflict) => {
    if (
      !window.confirm(
        "Delete the primary local copy? Its conflict copy will remain available.",
      )
    )
      return;
    if (conflict.category === "draft")
      await store?.drafts.delete(draftId(conflict.stableId));
    else if (conflict.category === "local_package")
      await store?.packages.delete(packageId(conflict.stableId));
    else if (conflict.category === "compilation")
      await store?.compilations.delete(conflict.stableId);
    else return;
    setMessage(
      "Primary copy deleted locally. Its deletion is waiting to synchronize.",
    );
    await refresh();
  };

  if (loading) return <p aria-live="polite">Loading synchronization…</p>;
  if (!configured)
    return (
      <Notice title="Local mode">
        Account synchronization needs a configured Supabase connection. All
        local workflows and records remain available.
      </Notice>
    );
  if (!identity)
    return (
      <Notice title={event === "expired" ? "Session expired" : "Sign in first"}>
        Queued work remains in this browser. Sign in again to resume without
        deleting or rewriting local data.
      </Notice>
    );
  if (!store || !engine)
    return (
      <Notice title="IndexedDB unavailable">
        Synchronization cannot start because durable browser storage is blocked.
      </Notice>
    );

  const local = plan?.local ?? emptyCounts;
  const remote = plan?.remote ?? emptyRemote;
  const pending = outbox.filter((item) => item.status === "pending").length;
  const failed = outbox.filter((item) => item.status === "failed").length;
  const statusByCategory = (
    ["draft", "library", "progress", "local_package", "compilation"] as const
  ).map((category) => ({
    category,
    waiting: records.filter(
      (record) => record.category === category && record.dirty,
    ).length,
    failed: records.filter(
      (record) => record.category === category && record.lastError,
    ).length,
    synced: records.filter(
      (record) => record.category === category && !record.dirty,
    ).length,
  }));

  return (
    <div className="sync-settings">
      <section className="settings-card sync-summary">
        <div className="settings-heading">
          <div>
            <p className="section-label">This device</p>
            <h2>Account synchronization</h2>
          </div>
          <Status tone={settings?.enabled ? "positive" : "neutral"}>
            {settings?.enabled ? "Enabled" : "Local only"}
          </Status>
        </div>
        <p>
          IndexedDB remains the working copy. Cloud records are a private
          synchronization and recovery layer and are never enabled by signing in
          alone.
        </p>
        <dl className="sync-metrics">
          <div>
            <dt>Last successful sync</dt>
            <dd>{date(settings?.lastSuccessfulSync)}</dd>
          </div>
          <div>
            <dt>Pending operations</dt>
            <dd>{pending}</dd>
          </div>
          <div>
            <dt>Failed operations</dt>
            <dd>{failed}</dd>
          </div>
          <div>
            <dt>Cloud storage</dt>
            <dd>{(remote.storageBytes / 1_048_576).toFixed(2)} MiB</dd>
          </div>
        </dl>
      </section>

      {!settings?.enabled ? (
        <section className="settings-card" aria-labelledby="sync-consent-title">
          <p className="section-label">Explicit consent</p>
          <h2 id="sync-consent-title">Choose what happens first</h2>
          <p>
            Review both sides before choosing. No upload, merge, overwrite, or
            deletion occurs until you confirm an action below.
          </p>
          <div
            className="sync-count-table"
            role="table"
            aria-label="Sync counts"
          >
            <div role="row">
              <strong role="columnheader">Category</strong>
              <strong role="columnheader">This device</strong>
              <strong role="columnheader">Cloud</strong>
            </div>
            {countRows(local, remote).map(
              ([label, localCount, remoteCount]) => (
                <div role="row" key={label}>
                  <span role="cell">{label}</span>
                  <span role="cell">{localCount}</span>
                  <span role="cell">{remoteCount}</span>
                </div>
              ),
            )}
          </div>
          {plan?.unclaimedDrafts ? (
            <Notice
              title={`${plan.unclaimedDrafts} unclaimed local draft${plan.unclaimedDrafts === 1 ? "" : "s"}`}
            >
              Unclaimed drafts remain local. Claim them explicitly in Studio
              before they can synchronize.
            </Notice>
          ) : null}
          <div className="sync-consent-actions">
            <Button disabled={busy} onClick={() => void run("merge")}>
              Merge local and cloud data
            </Button>
            <Button
              className="button-secondary"
              disabled={busy}
              onClick={() => void run("upload")}
            >
              Upload local data
            </Button>
            <Button
              className="button-secondary"
              disabled={busy}
              onClick={() => void run("download")}
            >
              Download cloud data
            </Button>
            <Button
              className="button-secondary"
              disabled={busy}
              onClick={() => void run("local-only")}
            >
              Keep this device local-only
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section className="settings-card">
            <div className="settings-heading">
              <div>
                <p className="section-label">Controls</p>
                <h2>{progress?.message ?? "Ready to synchronize"}</h2>
              </div>
              {busy ? <Status tone="neutral">Syncing</Status> : null}
            </div>
            {busy ? (
              <progress
                max={Math.max(progress?.total ?? 1, 1)}
                value={progress?.completed ?? 0}
              />
            ) : null}
            <div className="sync-consent-actions">
              <Button disabled={busy} onClick={() => void run()}>
                Sync now
              </Button>
              <Button
                className="button-secondary"
                onClick={() => {
                  if (busy) controller.current?.abort();
                  else
                    void store.sync
                      .configure({ pausedReason: "user" })
                      .then(() =>
                        setMessage(
                          "Background sync paused. Queued work remains local.",
                        ),
                      );
                }}
              >
                Pause sync
              </Button>
              <Button
                className="button-secondary"
                disabled={busy || failed === 0}
                onClick={() => void run()}
              >
                Retry failed
              </Button>
              <Button
                className="button-secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void engine
                    .disable()
                    .then(() =>
                      setMessage(
                        "Sync disabled on this device. Local data was not deleted.",
                      ),
                    )
                    .catch((reason) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "Sync could not be disabled.",
                      ),
                    )
                    .finally(async () => {
                      setBusy(false);
                      await refresh();
                    });
                }}
              >
                Disable sync on this device
              </Button>
            </div>
          </section>
          <section className="settings-card">
            <p className="section-label">Per-category status</p>
            <h2>Local queue and recovery state</h2>
            <ul className="sync-category-list">
              {statusByCategory.map((item) => (
                <li key={item.category}>
                  <strong>{item.category.replace("_", " ")}</strong>
                  <span>{item.synced} synced</span>
                  <span>{item.waiting} waiting</span>
                  <span>{item.failed} failed</span>
                </li>
              ))}
            </ul>
            {failed ? (
              <div className="sync-failures" role="alert">
                <strong>Failed operations</strong>
                <ul>
                  {outbox
                    .filter((operation) => operation.status === "failed")
                    .map((operation) => (
                      <li key={operation.id}>
                        {operation.category.replace("_", " ")}:{" "}
                        {operation.lastError ?? "Retry required."}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </section>
        </>
      )}

      <section className="settings-card">
        <p className="section-label">Conflicts</p>
        <h2>
          {conflicts.length
            ? `${conflicts.length} needs review`
            : "No conflicts"}
        </h2>
        {conflicts.length ? (
          <div className="sync-conflict-list">
            {conflicts.map((conflict) => (
              <article key={conflict.id}>
                <div className="settings-heading">
                  <h3>{conflict.category.replace("_", " ")} conflict</h3>
                  <Status tone="warning">Conflict</Status>
                </div>
                <p>{conflict.summary}</p>
                <dl className="sync-conflict-details">
                  <div>
                    <dt>Local</dt>
                    <dd>
                      revision {conflict.localRevision} ·{" "}
                      {date(conflict.localUpdatedAt)} · {conflict.localDeviceId}
                      {conflict.localChecksum
                        ? ` · checksum ${conflict.localChecksum}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Conflict copy</dt>
                    <dd>
                      revision {conflict.remoteRevision} ·{" "}
                      {date(conflict.remoteUpdatedAt)} ·{" "}
                      {conflict.remoteDeviceId}
                      {conflict.remoteChecksum
                        ? ` · checksum ${conflict.remoteChecksum}`
                        : ""}
                    </dd>
                  </div>
                </dl>
                <div className="sync-consent-actions">
                  {conflict.category === "draft" && conflict.conflictCopyId ? (
                    <LinkButton href={`/studio/${conflict.conflictCopyId}`}>
                      Inspect conflict copy
                    </LinkButton>
                  ) : null}
                  <Button
                    className="button-secondary"
                    onClick={() => {
                      const blob = new Blob(
                        [JSON.stringify(conflict, null, 2)],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `${conflict.stableId}-conflict.json`;
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export conflict details
                  </Button>
                  <Button
                    className="button-secondary"
                    onClick={() => {
                      void store.sync.deleteConflict(conflict.id).then(refresh);
                    }}
                  >
                    Keep both and dismiss
                  </Button>
                  {conflict.conflictCopyId ? (
                    <>
                      <Button
                        className="button-secondary"
                        onClick={() => void deleteConflictCopy(conflict)}
                      >
                        Delete conflict copy
                      </Button>
                      <Button
                        className="button-secondary"
                        onClick={() => void deletePrimaryCopy(conflict)}
                      >
                        Delete primary copy
                      </Button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>
            Independent source edits are never merged automatically. If they
            occur, both versions appear here.
          </p>
        )}
      </section>

      <Notice title="Artifact policy">
        Private artifacts up to {SYNC_ARTIFACT_LIMIT / 1_048_576} MiB are
        checksum-deduplicated. Larger artifacts keep their compilation metadata
        with an explicit “metadata only” status; they remain available locally
        on this device.
      </Notice>

      {error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-message success-message" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
