import type {
  ProviderCredential,
  ProviderCredentialStore,
  ProviderId,
} from "@theoria/ai-provider";
import type {
  CompilationRecord,
  DraftId,
  ImportedPackage,
  LearnerProgress,
  LibraryEntry,
  PackageDraft,
  PackageId,
} from "@theoria/package-model";

export interface DraftStore {
  list(): Promise<readonly PackageDraft[]>;
  get(id: DraftId): Promise<PackageDraft | undefined>;
  put(draft: PackageDraft): Promise<void>;
  delete(id: DraftId): Promise<void>;
}

export interface ImportedPackageStore {
  list(): Promise<readonly ImportedPackage[]>;
  get(id: PackageId): Promise<ImportedPackage | undefined>;
  put(value: ImportedPackage): Promise<void>;
  delete(id: PackageId): Promise<void>;
}

export interface LibraryStore {
  list(): Promise<readonly LibraryEntry[]>;
  get(id: PackageId): Promise<LibraryEntry | undefined>;
  put(value: LibraryEntry): Promise<void>;
  delete(id: PackageId): Promise<void>;
}

export interface ProgressStore {
  list(): Promise<readonly LearnerProgress[]>;
  get(id: PackageId): Promise<LearnerProgress | undefined>;
  put(value: LearnerProgress): Promise<void>;
  delete(id: PackageId): Promise<void>;
}

export interface CompilationStore {
  list(): Promise<readonly CompilationRecord[]>;
  get(id: string): Promise<CompilationRecord | undefined>;
  put(value: CompilationRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface LocalStore {
  readonly drafts: DraftStore;
  readonly packages: ImportedPackageStore;
  readonly library: LibraryStore;
  readonly progress: ProgressStore;
  readonly compilations: CompilationStore;
  /** Device-local provider secrets. This store is intentionally outside account sync. */
  readonly credentials: ProviderCredentialStore;
  readonly sync: LocalSyncStore;
}

export interface ResolvedLibrarySource {
  readonly archive: Blob;
  readonly compiledArtifact?: Blob;
}

type StoreName =
  | "drafts"
  | "packages"
  | "library"
  | "progress"
  | "compilations";

export type SyncCategory =
  | "draft"
  | "progress"
  | "library"
  | "local_package"
  | "compilation";

export interface LocalSyncSettings {
  readonly key: "device";
  readonly deviceId: string;
  readonly deviceName: string;
  readonly enabled: boolean;
  readonly userId?: string;
  readonly lastSuccessfulSync?: string | undefined;
  readonly lastCursor: number;
  readonly pausedReason?: "offline" | "expired" | "user" | undefined;
}

export interface LocalSyncRecord {
  readonly id: string;
  readonly category: SyncCategory;
  readonly stableId: string;
  readonly localRevision: number;
  readonly remoteRevision: number;
  readonly resetGeneration: number;
  readonly dirty: boolean;
  readonly deleted: boolean;
  readonly artifactStatus: "available" | "metadata_only" | "unavailable";
  readonly updatedAt: string;
  readonly deviceId: string;
  readonly lastError?: string;
}

export interface LocalSyncOutboxOperation {
  readonly id: string;
  readonly category: SyncCategory;
  readonly stableId: string;
  readonly operation: "put" | "delete";
  readonly localRevision: number;
  readonly createdAt: string;
  readonly attempts: number;
  readonly status: "pending" | "failed";
  readonly lastError?: string;
}

export interface LocalSyncConflict {
  readonly id: string;
  readonly category: SyncCategory;
  readonly stableId: string;
  readonly conflictCopyId?: string;
  readonly localRevision: number;
  readonly remoteRevision: number;
  readonly localChecksum?: string;
  readonly remoteChecksum?: string;
  readonly localUpdatedAt: string;
  readonly remoteUpdatedAt: string;
  readonly localDeviceId: string;
  readonly remoteDeviceId: string;
  readonly summary: string;
  readonly createdAt: string;
}

export interface LocalSyncCounts {
  readonly drafts: number;
  readonly library: number;
  readonly progress: number;
  readonly compilations: number;
  readonly localPackages: number;
}

export interface LocalSyncStore {
  settings(): Promise<LocalSyncSettings>;
  configure(
    update: Partial<Omit<LocalSyncSettings, "key" | "deviceId">>,
  ): Promise<LocalSyncSettings>;
  counts(): Promise<LocalSyncCounts>;
  value(
    category: SyncCategory,
    stableId: string,
  ): Promise<StoredValue | undefined>;
  values(category: SyncCategory): Promise<readonly StoredValue[]>;
  records(): Promise<readonly LocalSyncRecord[]>;
  record(
    category: SyncCategory,
    stableId: string,
  ): Promise<LocalSyncRecord | undefined>;
  markDirty(category: SyncCategory, stableId: string): Promise<void>;
  markSynced(
    category: SyncCategory,
    stableId: string,
    remoteRevision: number,
    artifactStatus?: LocalSyncRecord["artifactStatus"],
  ): Promise<void>;
  setRemoteRevision(
    category: SyncCategory,
    stableId: string,
    remoteRevision: number,
  ): Promise<void>;
  applyRemote(
    category: SyncCategory,
    stableId: string,
    value: StoredValue | undefined,
    state: Pick<
      LocalSyncRecord,
      | "remoteRevision"
      | "resetGeneration"
      | "deleted"
      | "artifactStatus"
      | "updatedAt"
      | "deviceId"
    >,
  ): Promise<void>;
  outbox(): Promise<readonly LocalSyncOutboxOperation[]>;
  fail(operation: LocalSyncOutboxOperation, message: string): Promise<void>;
  complete(operationId: string): Promise<void>;
  conflicts(): Promise<readonly LocalSyncConflict[]>;
  putConflict(conflict: LocalSyncConflict): Promise<void>;
  deleteConflict(id: string): Promise<void>;
}
export type StoredValue =
  | PackageDraft
  | ImportedPackage
  | LibraryEntry
  | LearnerProgress
  | CompilationRecord;

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });

export class IndexedDbLocalStore implements LocalStore {
  readonly drafts = this.repository<PackageDraft, DraftId>("drafts");
  readonly packages = this.repository<ImportedPackage, PackageId>("packages");
  readonly library = this.repository<LibraryEntry, PackageId>("library");
  readonly progress = this.repository<LearnerProgress, PackageId>("progress");
  readonly compilations = this.repository<CompilationRecord, string>(
    "compilations",
    "compilation",
  );
  readonly credentials: ProviderCredentialStore = {
    get: (provider) => this.getCredential(provider),
    put: (credential) => this.putCredential(credential),
    remove: (provider) => this.removeCredential(provider),
    selectedModel: async (provider) =>
      (await this.getCredential(provider))?.selectedModelId,
    selectModel: (provider, modelId) =>
      this.selectCredentialModel(provider, modelId),
  };
  readonly sync: LocalSyncStore = {
    settings: () => this.syncSettings(),
    configure: (update) => this.configureSync(update),
    counts: () => this.syncCounts(),
    value: (category, stableId) => this.valueFor(category, stableId),
    values: (category) => this.valuesFor(category),
    records: () => this.syncList<LocalSyncRecord>("syncRecords"),
    record: (category, stableId) =>
      this.syncGet<LocalSyncRecord>("syncRecords", `${category}:${stableId}`),
    markDirty: (category, stableId) => this.markDirty(category, stableId),
    markSynced: (category, stableId, remoteRevision, artifactStatus) =>
      this.markSynced(category, stableId, remoteRevision, artifactStatus),
    setRemoteRevision: (category, stableId, remoteRevision) =>
      this.setRemoteRevision(category, stableId, remoteRevision),
    applyRemote: (category, stableId, value, state) =>
      this.applyRemote(category, stableId, value, state),
    outbox: () => this.syncList<LocalSyncOutboxOperation>("syncOutbox"),
    fail: (operation, message) => this.failOutbox(operation, message),
    complete: (operationId) => this.syncDelete("syncOutbox", operationId),
    conflicts: () => this.syncList<LocalSyncConflict>("syncConflicts"),
    putConflict: (conflict) => this.syncPut("syncConflicts", conflict),
    deleteConflict: (id) => this.syncDelete("syncConflicts", id),
  };

  constructor(
    private readonly databaseName = "theoria",
    private readonly indexedDb: IDBFactory = globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    const request = this.indexedDb.open(this.databaseName, 6);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("drafts")) {
        database.createObjectStore("drafts", { keyPath: "id" });
        database.createObjectStore("packages", { keyPath: "id" });
        database.createObjectStore("library", { keyPath: "packageId" });
        database.createObjectStore("progress", { keyPath: "packageId" });
      }
      if (!database.objectStoreNames.contains("compilations")) {
        const compilations = database.createObjectStore("compilations", {
          keyPath: "id",
        });
        compilations.createIndex("createdAt", "createdAt");
        compilations.createIndex("sourceChecksum", "sourceChecksum");
      }
      // Database upgrades through v6 are additive. Draft schema migration is
      // performed record-by-record by the authoring domain so source blobs are
      // never rewritten merely by opening the database.
      if (!database.objectStoreNames.contains("library")) {
        database.createObjectStore("library", { keyPath: "packageId" });
      }
      if (!database.objectStoreNames.contains("syncSettings")) {
        database.createObjectStore("syncSettings", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("syncRecords")) {
        const records = database.createObjectStore("syncRecords", {
          keyPath: "id",
        });
        records.createIndex("category", "category");
        records.createIndex("dirty", "dirty");
      }
      if (!database.objectStoreNames.contains("syncOutbox")) {
        const outbox = database.createObjectStore("syncOutbox", {
          keyPath: "id",
        });
        outbox.createIndex("status", "status");
        outbox.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains("syncConflicts")) {
        const conflicts = database.createObjectStore("syncConflicts", {
          keyPath: "id",
        });
        conflicts.createIndex("category", "category");
        conflicts.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains("providerCredentials")) {
        database.createObjectStore("providerCredentials", {
          keyPath: "providerId",
        });
      }
    };
    return requestResult(request);
  }

  private async getCredential(
    provider: ProviderId,
  ): Promise<ProviderCredential | undefined> {
    const database = await this.open();
    return requestResult(
      database
        .transaction("providerCredentials")
        .objectStore("providerCredentials")
        .get(provider),
    ) as Promise<ProviderCredential | undefined>;
  }

  private async putCredential(credential: ProviderCredential): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(
      "providerCredentials",
      "readwrite",
    );
    transaction.objectStore("providerCredentials").put(credential);
    await transactionDone(transaction);
  }

  private async removeCredential(provider: ProviderId): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(
      "providerCredentials",
      "readwrite",
    );
    transaction.objectStore("providerCredentials").delete(provider);
    await transactionDone(transaction);
  }

  private async selectCredentialModel(
    provider: ProviderId,
    modelId: string,
  ): Promise<void> {
    const credential = await this.getCredential(provider);
    if (!credential)
      throw new Error("Connect the provider before selecting a model.");
    await this.putCredential({
      ...credential,
      selectedModelId: modelId,
      updatedAt: new Date().toISOString(),
    });
  }

  private repository<T extends StoredValue, K extends IDBValidKey>(
    storeName: StoreName,
    category: SyncCategory = storeName === "drafts"
      ? "draft"
      : storeName === "packages"
        ? "local_package"
        : storeName === "library"
          ? "library"
          : storeName === "progress"
            ? "progress"
            : "compilation",
  ): {
    list(): Promise<readonly T[]>;
    get(id: K): Promise<T | undefined>;
    put(value: T): Promise<void>;
    delete(id: K): Promise<void>;
  } {
    return {
      list: async () => {
        const database = await this.open();
        return requestResult(
          database.transaction(storeName).objectStore(storeName).getAll(),
        ) as Promise<T[]>;
      },
      get: async (id) => {
        const database = await this.open();
        return requestResult(
          database.transaction(storeName).objectStore(storeName).get(id),
        ) as Promise<T | undefined>;
      },
      put: async (value) =>
        this.commitLocalMutation(
          storeName,
          category,
          String(this.keyFor(category, value)),
          false,
          value,
        ),
      delete: async (id) =>
        this.commitLocalMutation(
          storeName,
          category,
          String(id),
          true,
          undefined,
        ),
    };
  }

  private keyFor(category: SyncCategory, value: StoredValue): string {
    if (category === "draft") return (value as PackageDraft).id;
    if (category === "local_package") return (value as ImportedPackage).id;
    if (category === "library") return (value as LibraryEntry).packageId;
    if (category === "progress") return (value as LearnerProgress).packageId;
    return (value as CompilationRecord).id;
  }

  private async syncSettings(): Promise<LocalSyncSettings> {
    const existing = await this.syncGet<LocalSyncSettings>(
      "syncSettings",
      "device",
    );
    if (existing) return existing;
    const created: LocalSyncSettings = {
      key: "device",
      deviceId: globalThis.crypto.randomUUID(),
      deviceName: "This browser",
      enabled: false,
      lastCursor: 0,
    };
    await this.syncPut("syncSettings", created);
    return created;
  }

  private async configureSync(
    update: Partial<Omit<LocalSyncSettings, "key" | "deviceId">>,
  ): Promise<LocalSyncSettings> {
    const current = await this.syncSettings();
    const next = { ...current, ...update };
    await this.syncPut("syncSettings", next);
    this.notifySync("configuration");
    return next;
  }

  private async syncCounts(): Promise<LocalSyncCounts> {
    const database = await this.open();
    const count = (name: StoreName) =>
      requestResult(database.transaction(name).objectStore(name).count());
    const [drafts, library, progress, compilations, localPackages] =
      await Promise.all([
        count("drafts"),
        count("library"),
        count("progress"),
        count("compilations"),
        count("packages"),
      ]);
    return { drafts, library, progress, compilations, localPackages };
  }

  private async trackMutation(
    category: SyncCategory,
    stableId: string,
    deleted: boolean,
    value?: StoredValue,
  ): Promise<void> {
    const settings = await this.syncSettings();
    const id = `${category}:${stableId}`;
    const previous = await this.syncGet<LocalSyncRecord>("syncRecords", id);
    const eligible =
      category !== "draft" ||
      (value as PackageDraft | undefined)?.owner?.userId === settings.userId;
    const updatedAt =
      "updatedAt" in (value ?? {})
        ? String((value as { updatedAt: string }).updatedAt)
        : new Date().toISOString();
    const state: LocalSyncRecord = {
      id,
      category,
      stableId,
      localRevision:
        Math.max(
          previous?.localRevision ?? 0,
          "revision" in (value ?? {})
            ? Number((value as { revision: number }).revision)
            : 0,
        ) + 1,
      remoteRevision: previous?.remoteRevision ?? 0,
      resetGeneration:
        (previous?.resetGeneration ?? 0) +
        (category === "progress" && deleted ? 1 : 0),
      dirty: true,
      deleted,
      artifactStatus: previous?.artifactStatus ?? "available",
      updatedAt,
      deviceId: settings.deviceId,
    };
    await this.syncPut("syncRecords", state);
    if (settings.enabled && settings.userId && eligible) {
      const operation: LocalSyncOutboxOperation = {
        id,
        category,
        stableId,
        operation: deleted ? "delete" : "put",
        localRevision: state.localRevision,
        createdAt: new Date().toISOString(),
        attempts: 0,
        status: "pending",
      };
      await this.syncPut("syncOutbox", operation);
    }
    this.notifySync("mutation");
  }

  private async commitLocalMutation(
    storeName: StoreName,
    category: SyncCategory,
    stableId: string,
    deleted: boolean,
    value?: StoredValue,
  ): Promise<void> {
    const settings = await this.syncSettings();
    const id = `${category}:${stableId}`;
    const database = await this.open();
    const transaction = database.transaction(
      [storeName, "syncRecords", "syncOutbox"],
      "readwrite",
    );
    const records = transaction.objectStore("syncRecords");
    const previous = (await requestResult(records.get(id))) as
      | LocalSyncRecord
      | undefined;
    const eligible =
      category !== "draft" ||
      (value as PackageDraft | undefined)?.owner?.userId === settings.userId;
    const updatedAt =
      "updatedAt" in (value ?? {})
        ? String((value as { updatedAt: string }).updatedAt)
        : new Date().toISOString();
    const state: LocalSyncRecord = {
      id,
      category,
      stableId,
      localRevision:
        Math.max(
          previous?.localRevision ?? 0,
          "revision" in (value ?? {})
            ? Number((value as { revision: number }).revision)
            : 0,
        ) + 1,
      remoteRevision: previous?.remoteRevision ?? 0,
      resetGeneration:
        (previous?.resetGeneration ?? 0) +
        (category === "progress" && deleted ? 1 : 0),
      dirty: true,
      deleted,
      artifactStatus: previous?.artifactStatus ?? "available",
      updatedAt,
      deviceId: settings.deviceId,
    };
    const values = transaction.objectStore(storeName);
    if (deleted) values.delete(stableId);
    else values.put(value);
    records.put(state);
    if (settings.enabled && settings.userId && eligible) {
      transaction.objectStore("syncOutbox").put({
        id,
        category,
        stableId,
        operation: deleted ? "delete" : "put",
        localRevision: state.localRevision,
        createdAt: new Date().toISOString(),
        attempts: 0,
        status: "pending",
      } satisfies LocalSyncOutboxOperation);
    }
    await transactionDone(transaction);
    this.notifySync("mutation");
  }

  private async markDirty(
    category: SyncCategory,
    stableId: string,
  ): Promise<void> {
    const value = await this.valueFor(category, stableId);
    await this.trackMutation(category, stableId, false, value);
  }

  private async markSynced(
    category: SyncCategory,
    stableId: string,
    remoteRevision: number,
    artifactStatus: LocalSyncRecord["artifactStatus"] = "available",
  ): Promise<void> {
    const id = `${category}:${stableId}`;
    const previous = await this.syncGet<LocalSyncRecord>("syncRecords", id);
    if (!previous) return;
    await this.syncPut("syncRecords", {
      ...previous,
      remoteRevision,
      dirty: false,
      artifactStatus,
      lastError: undefined,
    });
    await this.syncDelete("syncOutbox", id);
    this.notifySync("state");
  }

  private async setRemoteRevision(
    category: SyncCategory,
    stableId: string,
    remoteRevision: number,
  ): Promise<void> {
    const id = `${category}:${stableId}`;
    const previous = await this.syncGet<LocalSyncRecord>("syncRecords", id);
    if (!previous) return;
    await this.syncPut("syncRecords", {
      ...previous,
      remoteRevision,
      dirty: true,
    });
  }

  private async applyRemote(
    category: SyncCategory,
    stableId: string,
    value: StoredValue | undefined,
    state: Pick<
      LocalSyncRecord,
      | "remoteRevision"
      | "resetGeneration"
      | "deleted"
      | "artifactStatus"
      | "updatedAt"
      | "deviceId"
    >,
  ): Promise<void> {
    const database = await this.open();
    const storeName = this.storeFor(category);
    const transaction = database.transaction(
      [storeName, "syncRecords", "syncOutbox"],
      "readwrite",
    );
    const records = transaction.objectStore(storeName);
    if (state.deleted || !value) records.delete(stableId);
    else records.put(value);
    transaction.objectStore("syncRecords").put({
      id: `${category}:${stableId}`,
      category,
      stableId,
      localRevision: state.remoteRevision,
      remoteRevision: state.remoteRevision,
      resetGeneration: state.resetGeneration,
      dirty: false,
      deleted: state.deleted,
      artifactStatus: state.artifactStatus,
      updatedAt: state.updatedAt,
      deviceId: state.deviceId,
    } satisfies LocalSyncRecord);
    transaction.objectStore("syncOutbox").delete(`${category}:${stableId}`);
    await transactionDone(transaction);
    this.notifySync("state");
  }

  private async failOutbox(
    operation: LocalSyncOutboxOperation,
    message: string,
  ): Promise<void> {
    await this.syncPut("syncOutbox", {
      ...operation,
      attempts: operation.attempts + 1,
      status: "failed",
      lastError: message,
    });
    const record = await this.syncGet<LocalSyncRecord>(
      "syncRecords",
      operation.id,
    );
    if (record)
      await this.syncPut("syncRecords", { ...record, lastError: message });
    this.notifySync("state");
  }

  private async valueFor(
    category: SyncCategory,
    stableId: string,
  ): Promise<StoredValue | undefined> {
    const database = await this.open();
    return requestResult(
      database
        .transaction(this.storeFor(category))
        .objectStore(this.storeFor(category))
        .get(stableId),
    ) as Promise<StoredValue | undefined>;
  }

  private async valuesFor(
    category: SyncCategory,
  ): Promise<readonly StoredValue[]> {
    const database = await this.open();
    const storeName = this.storeFor(category);
    return requestResult(
      database.transaction(storeName).objectStore(storeName).getAll(),
    ) as Promise<StoredValue[]>;
  }

  private storeFor(category: SyncCategory): StoreName {
    return category === "draft"
      ? "drafts"
      : category === "progress"
        ? "progress"
        : category === "library"
          ? "library"
          : category === "local_package"
            ? "packages"
            : "compilations";
  }

  private async syncList<T>(
    storeName: "syncRecords" | "syncOutbox" | "syncConflicts",
  ): Promise<readonly T[]> {
    const database = await this.open();
    return requestResult(
      database.transaction(storeName).objectStore(storeName).getAll(),
    ) as Promise<T[]>;
  }

  private async syncGet<T>(
    storeName: "syncSettings" | "syncRecords",
    id: IDBValidKey,
  ): Promise<T | undefined> {
    const database = await this.open();
    return requestResult(
      database.transaction(storeName).objectStore(storeName).get(id),
    ) as Promise<T | undefined>;
  }

  private async syncPut(
    storeName: "syncSettings" | "syncRecords" | "syncOutbox" | "syncConflicts",
    value: unknown,
  ): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
  }

  private async syncDelete(
    storeName: "syncOutbox" | "syncConflicts",
    id: IDBValidKey,
  ): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    await transactionDone(transaction);
  }

  private notifySync(reason: "configuration" | "mutation" | "state"): void {
    if (typeof dispatchEvent === "undefined") return;
    dispatchEvent(
      typeof CustomEvent === "undefined"
        ? new Event("theoria-sync-change")
        : new CustomEvent("theoria-sync-change", { detail: { reason } }),
    );
  }

  async resolveLibrarySource(
    entry: LibraryEntry,
  ): Promise<ResolvedLibrarySource> {
    if (entry.source.type === "package") {
      const record = await this.packages.get(entry.source.packageRecordId);
      if (!record)
        throw new Error("The saved source package is missing or corrupt.");
      return { archive: record.archive };
    }
    const compilation = await this.compilations.get(entry.source.compilationId);
    if (!compilation?.sourceArchive) {
      throw new Error("The compilation source archive is missing or corrupt.");
    }
    return {
      archive: compilation.sourceArchive,
      compiledArtifact: compilation.compiledArtifact,
    };
  }

  async removeLearningPackage(entry: LibraryEntry): Promise<void> {
    await Promise.all([
      this.library.delete(entry.packageId),
      this.progress.delete(entry.packageId),
      entry.source.type === "package"
        ? this.packages.delete(entry.source.packageRecordId)
        : Promise.resolve(),
    ]);
  }
}
