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
type StoredValue =
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
  );

  constructor(
    private readonly databaseName = "theoria",
    private readonly indexedDb: IDBFactory = globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    const request = this.indexedDb.open(this.databaseName, 3);
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
      // v2 → v3 is additive. Existing progress records remain readable and are
      // replaced only when a learner opens that exact library package.
      if (!database.objectStoreNames.contains("library")) {
        database.createObjectStore("library", { keyPath: "packageId" });
      }
    };
    return requestResult(request);
  }

  private repository<T extends StoredValue, K extends IDBValidKey>(
    storeName: StoreName,
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
      put: async (value) => {
        const database = await this.open();
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(value);
        await transactionDone(transaction);
      },
      delete: async (id) => {
        const database = await this.open();
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).delete(id);
        await transactionDone(transaction);
      },
    };
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
