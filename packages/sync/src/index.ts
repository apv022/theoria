import type {
  LocalSyncConflict,
  LocalSyncCounts,
  LocalSyncOutboxOperation,
  LocalSyncRecord,
  LocalSyncStore,
  StoredValue,
  SyncCategory,
} from "@theoria/local-store";
import type {
  CompilationRecord,
  ImportedPackage,
  LearnerProgress,
  LibraryEntry,
  PackageDraft,
} from "@theoria/package-model";
import type {
  RemoteSyncCounts,
  RemoteSyncRecord,
  SyncBlobKind,
  SyncBlobReference,
  SyncClient,
} from "@theoria/platform-client";

export const SYNC_ARTIFACT_LIMIT = 25 * 1024 * 1024;

export type SyncOnboardingChoice =
  | "merge"
  | "upload"
  | "download"
  | "local-only";

export interface SyncPlan {
  readonly local: LocalSyncCounts;
  readonly remote: RemoteSyncCounts;
  readonly unclaimedDrafts: number;
}

export interface SyncProgress {
  readonly phase:
    | "planning"
    | "downloading"
    | "uploading"
    | "reconciling"
    | "complete"
    | "paused";
  readonly category?: SyncCategory;
  readonly completed: number;
  readonly total: number;
  readonly message: string;
}

export interface SyncRunResult {
  readonly uploaded: number;
  readonly downloaded: number;
  readonly conflicts: number;
  readonly failed: number;
  readonly cursor: number;
}

type BinaryMarker = {
  readonly $theoriaBlob: SyncBlobReference & {
    readonly representation: "blob" | "array-buffer";
  };
};

type EncodedValue = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly artifactStatus: LocalSyncRecord["artifactStatus"];
};

const abortIfNeeded = (signal?: AbortSignal): void => {
  if (signal?.aborted)
    throw new DOMException("Synchronization cancelled.", "AbortError");
};

const checksum = async (blob: Blob): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
  );
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const binaryKind = (category: SyncCategory, property: string): SyncBlobKind => {
  if (category === "draft" && property === "originalSourceArchive")
    return "draft";
  if (category === "local_package") return "local_package";
  if (category === "compilation" && property === "sourceArchive")
    return "source";
  if (category === "compilation" && property === "compiledArtifact")
    return "compiled";
  return "record_binary";
};

const sourceChecksum = (value: StoredValue | undefined): string | undefined => {
  if (!value) return undefined;
  if ("sourceChecksum" in value && typeof value.sourceChecksum === "string")
    return value.sourceChecksum;
  return undefined;
};

const updatedAt = (value: StoredValue): string => {
  if ("updatedAt" in value && typeof value.updatedAt === "string")
    return value.updatedAt;
  if ("addedAt" in value) return value.lastOpenedAt ?? value.addedAt;
  if ("importedAt" in value) return value.importedAt;
  return new Date().toISOString();
};

async function encodeValue(
  category: SyncCategory,
  value: StoredValue,
  remote: SyncClient,
  signal?: AbortSignal,
  onArtifactProgress?: (percentage: number) => void,
): Promise<EncodedValue> {
  let metadataOnly = false;

  const visit = async (input: unknown, property = ""): Promise<unknown> => {
    abortIfNeeded(signal);
    if (input instanceof Blob || input instanceof ArrayBuffer) {
      const blob =
        input instanceof Blob
          ? input
          : new Blob([input], { type: "application/octet-stream" });
      const reference = {
        checksum: await checksum(blob),
        kind: binaryKind(category, property),
        byteSize: blob.size,
        contentType: blob.type || "application/octet-stream",
      };
      if (blob.size > SYNC_ARTIFACT_LIMIT) {
        metadataOnly = true;
        return {
          $theoriaBlob: {
            ...reference,
            available: false,
            representation: input instanceof Blob ? "blob" : "array-buffer",
          },
        } satisfies BinaryMarker;
      }
      const uploaded = await remote.uploadBlob(reference, blob, {
        ...(signal ? { signal } : {}),
        ...(onArtifactProgress ? { onProgress: onArtifactProgress } : {}),
      });
      return {
        $theoriaBlob: {
          ...uploaded,
          representation: input instanceof Blob ? "blob" : "array-buffer",
        },
      } satisfies BinaryMarker;
    }
    if (Array.isArray(input))
      return Promise.all(input.map((item) => visit(item, property)));
    if (input && typeof input === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(input))
        result[key] = await visit(nested, key);
      return result;
    }
    return input;
  };

  const payload = (await visit(value)) as Readonly<Record<string, unknown>>;
  return {
    payload,
    artifactStatus: metadataOnly ? "metadata_only" : "available",
  };
}

async function decodeValue(
  payload: Readonly<Record<string, unknown>>,
  remote: SyncClient,
  signal?: AbortSignal,
): Promise<StoredValue> {
  const visit = async (input: unknown): Promise<unknown> => {
    abortIfNeeded(signal);
    if (input && typeof input === "object" && "$theoriaBlob" in input) {
      const marker = (input as BinaryMarker).$theoriaBlob;
      if (!marker.available)
        return marker.representation === "blob"
          ? new Blob([], { type: marker.contentType })
          : new ArrayBuffer(0);
      const blob = await remote.downloadBlob(marker);
      return marker.representation === "blob" ? blob : await blob.arrayBuffer();
    }
    if (Array.isArray(input)) return Promise.all(input.map(visit));
    if (input && typeof input === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(input))
        result[key] = await visit(nested);
      return result;
    }
    return input;
  };
  return (await visit(payload)) as StoredValue;
}

const unionBooleans = (
  left: Readonly<Record<string, boolean>>,
  right: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> => {
  const result = { ...left };
  for (const [key, value] of Object.entries(right))
    result[key] = Boolean(result[key] || value);
  return result;
};

export function mergeProgress(
  local: LearnerProgress,
  remote: LearnerProgress,
): LearnerProgress {
  const localGeneration = local.resetGeneration ?? 0;
  const remoteGeneration = remote.resetGeneration ?? 0;
  if (localGeneration !== remoteGeneration)
    return localGeneration > remoteGeneration ? local : remote;

  const newer =
    local.updatedAt.localeCompare(remote.updatedAt) >= 0 ? local : remote;
  const questions = { ...local.questions };
  for (const [id, incoming] of Object.entries(remote.questions)) {
    const current = questions[id];
    if (!current) questions[id] = incoming;
    else {
      const newest =
        current.updatedAt.localeCompare(incoming.updatedAt) >= 0
          ? current
          : incoming;
      questions[id] = {
        ...newest,
        complete: current.complete || incoming.complete,
        correct:
          current.correct === true || incoming.correct === true
            ? true
            : newest.correct,
        attempted: current.attempted || incoming.attempted,
        checked: current.checked || incoming.checked,
        earned: Math.max(current.earned ?? 0, incoming.earned ?? 0),
        attempts: Math.max(current.attempts, incoming.attempts),
      };
    }
  }
  const assessments = { ...local.assessments };
  for (const [id, incoming] of Object.entries(remote.assessments)) {
    const current = assessments[id];
    if (!current) assessments[id] = incoming;
    else
      assessments[id] = {
        ...(current.submittedAt.localeCompare(incoming.submittedAt) >= 0
          ? current
          : incoming),
        submitted: current.submitted || incoming.submitted,
        score: Math.max(current.score, incoming.score),
        possible: Math.max(current.possible, incoming.possible),
        passed:
          current.passed === true || incoming.passed === true
            ? true
            : (current.passed ?? incoming.passed),
        pendingManual: current.pendingManual || incoming.pendingManual,
        attempts: Math.max(current.attempts, incoming.attempts),
      };
  }
  const completedAt =
    local.completedAt && remote.completedAt
      ? local.completedAt > remote.completedAt
        ? local.completedAt
        : remote.completedAt
      : (local.completedAt ?? remote.completedAt);
  return {
    ...newer,
    revision: Math.max(local.revision, remote.revision) + 1,
    resetGeneration: localGeneration,
    questions,
    assessments,
    activities: unionBooleans(local.activities, remote.activities),
    lessons: unionBooleans(local.lessons, remote.lessons),
    viewedActivities: unionBooleans(
      local.viewedActivities,
      remote.viewedActivities,
    ),
    manualCompletions: unionBooleans(
      local.manualCompletions,
      remote.manualCompletions,
    ),
    ...(completedAt ? { completedAt } : {}),
    startedAt:
      local.startedAt < remote.startedAt ? local.startedAt : remote.startedAt,
    lastOpenedAt:
      local.lastOpenedAt > remote.lastOpenedAt
        ? local.lastOpenedAt
        : remote.lastOpenedAt,
    updatedAt: new Date().toISOString(),
  };
}

export class TheoriaSyncEngine {
  constructor(
    private readonly local: LocalSyncStore,
    private readonly remote: SyncClient,
  ) {}

  async plan(userId: string): Promise<SyncPlan> {
    const [local, remote, drafts] = await Promise.all([
      this.local.counts(),
      this.remote.counts(),
      this.local.values("draft"),
    ]);
    const unclaimedDrafts = drafts.filter(
      (value) => (value as PackageDraft).owner?.userId !== userId,
    ).length;
    return { local, remote, unclaimedDrafts };
  }

  async enable(
    choice: SyncOnboardingChoice,
    userId: string,
    deviceName = "This browser",
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress?: (progress: SyncProgress) => void;
    } = {},
  ): Promise<SyncRunResult | undefined> {
    const settings = await this.local.settings();
    if (choice === "local-only") {
      await this.local.configure({
        enabled: false,
        userId,
        pausedReason: "user",
      });
      return undefined;
    }
    await this.remote.registerDevice(settings.deviceId, deviceName, true);
    await this.local.configure({
      enabled: true,
      userId,
      deviceName,
      pausedReason: undefined,
      lastCursor: 0,
    });
    if (choice !== "download") await this.enqueueOwnedLocal(userId);
    return this.syncNow({ ...options, startCursor: 0 });
  }

  async disable(): Promise<void> {
    const settings = await this.local.settings();
    if (settings.userId)
      await this.remote.registerDevice(
        settings.deviceId,
        settings.deviceName,
        false,
      );
    await this.local.configure({
      enabled: false,
      pausedReason: "user",
    });
  }

  async enqueueOwnedLocal(userId: string): Promise<void> {
    const categories: readonly SyncCategory[] = [
      "draft",
      "local_package",
      "library",
      "progress",
      "compilation",
    ];
    for (const category of categories) {
      const values = await this.values(category);
      for (const value of values) {
        if (
          category === "draft" &&
          (value as PackageDraft).owner?.userId !== userId
        )
          continue;
        await this.local.markDirty(category, this.stableId(category, value));
      }
    }
  }

  async syncNow(
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress?: (progress: SyncProgress) => void;
      readonly startCursor?: number;
    } = {},
  ): Promise<SyncRunResult> {
    const settings = await this.local.settings();
    if (!settings.enabled || !settings.userId)
      throw new Error("Synchronization is not enabled on this device.");
    if (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !navigator.onLine
    ) {
      await this.local.configure({ pausedReason: "offline" });
      throw new Error("Synchronization is waiting for a network connection.");
    }
    abortIfNeeded(options.signal);
    options.onProgress?.({
      phase: "downloading",
      completed: 0,
      total: 1,
      message: "Checking cloud changes",
    });
    let cursor = options.startCursor ?? settings.lastCursor;
    let downloaded = 0;
    let conflicts = 0;
    let hasMore = true;
    while (hasMore) {
      const page = await this.remote.list(cursor, 100);
      for (const record of page.records) {
        abortIfNeeded(options.signal);
        const result = await this.reconcile(record, options.signal);
        downloaded += result.downloaded;
        conflicts += result.conflicts;
      }
      cursor = page.nextCursor;
      hasMore = page.hasMore;
    }

    const operations = (await this.local.outbox()).filter(
      (operation) => operation.attempts < 5,
    );
    let uploaded = 0;
    let failed = 0;
    for (const [index, operation] of operations.entries()) {
      abortIfNeeded(options.signal);
      options.onProgress?.({
        phase: "uploading",
        category: operation.category,
        completed: index,
        total: operations.length,
        message: `Synchronizing ${operation.category.replace("_", " ")}`,
      });
      try {
        await this.push(operation, settings.deviceId, options);
        uploaded += 1;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError")
          throw reason;
        failed += 1;
        await this.local.fail(
          operation,
          reason instanceof Error ? reason.message : "Synchronization failed.",
        );
      }
    }
    const completedAt = new Date().toISOString();
    await this.local.configure({
      lastCursor: cursor,
      ...(failed ? {} : { lastSuccessfulSync: completedAt }),
      pausedReason: undefined,
    });
    options.onProgress?.({
      phase: "complete",
      completed: uploaded + downloaded,
      total: uploaded + downloaded,
      message: failed
        ? "Synchronization completed with retryable failures"
        : "Synchronization complete",
    });
    return { uploaded, downloaded, conflicts, failed, cursor };
  }

  private async push(
    operation: LocalSyncOutboxOperation,
    deviceId: string,
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress?: (progress: SyncProgress) => void;
    },
  ): Promise<void> {
    const state = await this.local.record(
      operation.category,
      operation.stableId,
    );
    const value = await this.local.value(
      operation.category,
      operation.stableId,
    );
    if (!state) {
      await this.local.complete(operation.id);
      return;
    }
    const encoded =
      operation.operation === "delete" || !value
        ? { payload: {}, artifactStatus: state.artifactStatus }
        : await encodeValue(
            operation.category,
            value,
            this.remote,
            options.signal,
            (percentage) =>
              options.onProgress?.({
                phase: "uploading",
                category: operation.category,
                completed: percentage,
                total: 100,
                message: "Uploading private artifact",
              }),
          );
    const valueChecksum = sourceChecksum(value);
    const result = await this.remote.apply(
      {
        category: operation.category,
        stableId: operation.stableId,
        schemaVersion: 1,
        resetGeneration: state.resetGeneration,
        ...(valueChecksum ? { sourceChecksum: valueChecksum } : {}),
        payload: encoded.payload,
        artifactStatus: encoded.artifactStatus,
        deleted: operation.operation === "delete" || state.deleted,
        deviceId,
        operationId: `${deviceId}:${operation.category}:${operation.stableId}:${operation.localRevision}`,
      },
      state.remoteRevision,
    );
    await this.local.markSynced(
      operation.category,
      operation.stableId,
      result.revision,
      encoded.artifactStatus,
    );
  }

  private async reconcile(
    remoteRecord: RemoteSyncRecord,
    signal?: AbortSignal,
  ): Promise<{ downloaded: number; conflicts: number }> {
    const state = await this.local.record(
      remoteRecord.category,
      remoteRecord.stableId,
    );
    const localValue = await this.local.value(
      remoteRecord.category,
      remoteRecord.stableId,
    );
    if (state?.remoteRevision === remoteRecord.revision)
      return { downloaded: 0, conflicts: 0 };
    if (!localValue || !state?.dirty) {
      const decoded = remoteRecord.deleted
        ? undefined
        : await decodeValue(remoteRecord.payload, this.remote, signal);
      await this.local.applyRemote(
        remoteRecord.category,
        remoteRecord.stableId,
        decoded,
        {
          remoteRevision: remoteRecord.revision,
          resetGeneration: remoteRecord.resetGeneration,
          deleted: remoteRecord.deleted,
          artifactStatus: remoteRecord.artifactStatus,
          updatedAt: remoteRecord.updatedAt,
          deviceId: remoteRecord.deviceId,
        },
      );
      return { downloaded: 1, conflicts: 0 };
    }
    // A pull can observe an older revision written by this device while a
    // newer local edit is already queued. Advance the base revision without
    // clearing that edit so the pending push cannot become a false conflict.
    if (remoteRecord.deviceId === state.deviceId) {
      await this.local.setRemoteRevision(
        remoteRecord.category,
        remoteRecord.stableId,
        remoteRecord.revision,
      );
      return { downloaded: 0, conflicts: 0 };
    }
    if (remoteRecord.deleted) {
      if (
        remoteRecord.category === "progress" &&
        remoteRecord.resetGeneration >= state.resetGeneration
      ) {
        await this.local.applyRemote(
          remoteRecord.category,
          remoteRecord.stableId,
          undefined,
          {
            remoteRevision: remoteRecord.revision,
            resetGeneration: remoteRecord.resetGeneration,
            deleted: true,
            artifactStatus: remoteRecord.artifactStatus,
            updatedAt: remoteRecord.updatedAt,
            deviceId: remoteRecord.deviceId,
          },
        );
        return { downloaded: 1, conflicts: 0 };
      }
      if (
        remoteRecord.category === "library" &&
        remoteRecord.updatedAt >= state.updatedAt
      ) {
        await this.local.applyRemote(
          remoteRecord.category,
          remoteRecord.stableId,
          undefined,
          {
            remoteRevision: remoteRecord.revision,
            resetGeneration: remoteRecord.resetGeneration,
            deleted: true,
            artifactStatus: remoteRecord.artifactStatus,
            updatedAt: remoteRecord.updatedAt,
            deviceId: remoteRecord.deviceId,
          },
        );
        return { downloaded: 1, conflicts: 0 };
      }
      await this.local.setRemoteRevision(
        remoteRecord.category,
        remoteRecord.stableId,
        remoteRecord.revision,
      );
      return { downloaded: 0, conflicts: 0 };
    }

    const remoteValue = await decodeValue(
      remoteRecord.payload,
      this.remote,
      signal,
    );
    if (remoteRecord.category === "progress") {
      const merged = mergeProgress(
        localValue as LearnerProgress,
        remoteValue as LearnerProgress,
      );
      await this.local.applyRemote("progress", remoteRecord.stableId, merged, {
        remoteRevision: remoteRecord.revision,
        resetGeneration: Math.max(
          state.resetGeneration,
          remoteRecord.resetGeneration,
        ),
        deleted: false,
        artifactStatus: remoteRecord.artifactStatus,
        updatedAt: merged.updatedAt,
        deviceId: state.deviceId,
      });
      await this.local.markDirty("progress", remoteRecord.stableId);
      return { downloaded: 1, conflicts: 0 };
    }
    if (remoteRecord.category === "library") {
      const localEntry = localValue as LibraryEntry;
      const remoteEntry = remoteValue as LibraryEntry;
      const lastOpenedAt =
        (localEntry.lastOpenedAt ?? "") >= (remoteEntry.lastOpenedAt ?? "")
          ? localEntry.lastOpenedAt
          : remoteEntry.lastOpenedAt;
      const merged = {
        ...(localEntry.addedAt <= remoteEntry.addedAt
          ? localEntry
          : remoteEntry),
        ...(lastOpenedAt ? { lastOpenedAt } : {}),
      } satisfies LibraryEntry;
      await this.local.applyRemote("library", remoteRecord.stableId, merged, {
        remoteRevision: remoteRecord.revision,
        resetGeneration: 0,
        deleted: false,
        artifactStatus: remoteRecord.artifactStatus,
        updatedAt: new Date().toISOString(),
        deviceId: state.deviceId,
      });
      await this.local.markDirty("library", remoteRecord.stableId);
      return { downloaded: 1, conflicts: 0 };
    }
    if (
      (remoteRecord.category === "compilation" ||
        remoteRecord.category === "local_package") &&
      remoteRecord.sourceChecksum &&
      remoteRecord.sourceChecksum === sourceChecksum(localValue)
    ) {
      await this.local.markSynced(
        remoteRecord.category,
        remoteRecord.stableId,
        remoteRecord.revision,
        remoteRecord.artifactStatus,
      );
      return { downloaded: 0, conflicts: 0 };
    }
    await this.preserveConflict(localValue, remoteValue, state, remoteRecord);
    return { downloaded: 1, conflicts: 1 };
  }

  private async preserveConflict(
    localValue: StoredValue,
    remoteValue: StoredValue,
    localState: LocalSyncRecord,
    remoteRecord: RemoteSyncRecord,
  ): Promise<void> {
    const suffix = (
      remoteRecord.sourceChecksum ?? String(remoteRecord.revision)
    ).slice(0, 8);
    const conflictCopyId = `${remoteRecord.stableId}-conflict-${suffix}`;
    let copy = remoteValue;
    if (remoteRecord.category === "draft")
      copy = {
        ...(remoteValue as PackageDraft),
        id: conflictCopyId,
        title: `${(remoteValue as PackageDraft).title} (conflict copy)`,
      } as PackageDraft;
    else if (remoteRecord.category === "compilation")
      copy = {
        ...(remoteValue as CompilationRecord),
        id: conflictCopyId,
      };
    else if (remoteRecord.category === "local_package")
      copy = {
        ...(remoteValue as ImportedPackage),
        id: conflictCopyId,
      } as ImportedPackage;
    await this.local.applyRemote(remoteRecord.category, conflictCopyId, copy, {
      remoteRevision: 0,
      resetGeneration: remoteRecord.resetGeneration,
      deleted: false,
      artifactStatus: remoteRecord.artifactStatus,
      updatedAt: remoteRecord.updatedAt,
      deviceId: remoteRecord.deviceId,
    });
    await this.local.setRemoteRevision(
      remoteRecord.category,
      remoteRecord.stableId,
      remoteRecord.revision,
    );
    const localChecksum = sourceChecksum(localValue);
    const conflict: LocalSyncConflict = {
      id: `${remoteRecord.category}:${remoteRecord.stableId}:${remoteRecord.revision}`,
      category: remoteRecord.category,
      stableId: remoteRecord.stableId,
      conflictCopyId,
      localRevision: localState.localRevision,
      remoteRevision: remoteRecord.revision,
      ...(localChecksum ? { localChecksum } : {}),
      ...(remoteRecord.sourceChecksum
        ? { remoteChecksum: remoteRecord.sourceChecksum }
        : {}),
      localUpdatedAt: updatedAt(localValue),
      remoteUpdatedAt: remoteRecord.updatedAt,
      localDeviceId: localState.deviceId,
      remoteDeviceId: remoteRecord.deviceId,
      summary:
        "Both devices changed this immutable source independently. The cloud version was restored as a conflict copy.",
      createdAt: new Date().toISOString(),
    };
    await this.local.putConflict(conflict);
  }

  private async values(
    category: SyncCategory,
  ): Promise<readonly StoredValue[]> {
    return this.local.values(category);
  }

  private stableId(category: SyncCategory, value: StoredValue): string {
    if (category === "draft") return (value as PackageDraft).id;
    if (category === "progress") return (value as LearnerProgress).packageId;
    if (category === "library") return (value as LibraryEntry).packageId;
    if (category === "local_package") return (value as ImportedPackage).id;
    return (value as CompilationRecord).id;
  }
}

export const syncStatusLabel = (
  record: LocalSyncRecord | undefined,
  enabled: boolean,
): "Local only" | "Waiting to sync" | "Synced" | "Conflict" | "Sync failed" => {
  if (!enabled || !record) return "Local only";
  if (record.lastError) return "Sync failed";
  if (record.dirty) return "Waiting to sync";
  return "Synced";
};
