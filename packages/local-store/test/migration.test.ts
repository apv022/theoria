import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { OPENROUTER_PROVIDER_ID } from "@theoria/ai-provider";
import {
  draftId,
  packageId,
  type CompilationRecord,
  type LearnerProgress,
  type PackageDraft,
} from "@theoria/package-model";
import { IndexedDbLocalStore } from "../src/index";

const openV2 = (factory: IDBFactory, name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(name, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore("drafts", { keyPath: "id" });
      database.createObjectStore("packages", { keyPath: "id" });
      database.createObjectStore("library", { keyPath: "packageId" });
      database.createObjectStore("progress", { keyPath: "packageId" });
      const compilations = database.createObjectStore("compilations", {
        keyPath: "id",
      });
      compilations.createIndex("createdAt", "createdAt");
      compilations.createIndex("sourceChecksum", "sourceChecksum");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

test("v2 to v6 migration preserves compilation history and adds no destructive changes", async () => {
  const factory = new IDBFactory();
  const name = "migration-test";
  const database = await openV2(factory, name);
  const record = {
    id: "compile-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceChecksum: "abc",
    sourceArchive: new Blob(["source"]),
    compiledArtifact: new Blob(["compiled"]),
  } as CompilationRecord;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("compilations", "readwrite");
    transaction.objectStore("compilations").put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();

  const store = new IndexedDbLocalStore(name, factory);
  assert.equal(
    (await store.compilations.get("compile-1"))?.sourceChecksum,
    "abc",
  );

  const progress = {
    schema: 1,
    packageId: packageId("package"),
    packageVersion: "1.0.0",
    contentId: "checksum",
    revision: 1,
    questions: {},
    activities: {},
    assessments: {},
    lessons: {},
    viewedActivities: {},
    questionOrders: {},
    matchingOrders: {},
    orderingOrders: {},
    manualCompletions: {},
    assignmentSubmissions: {},
    startedAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies LearnerProgress;
  await store.progress.put(progress);
  assert.deepEqual(await store.progress.get(progress.packageId), progress);
});

test("v3 to v6 migration preserves every existing store and draft byte", async () => {
  const factory = new IDBFactory();
  const name = "draft-migration-test";
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("drafts", { keyPath: "id" });
      db.createObjectStore("packages", { keyPath: "id" });
      db.createObjectStore("library", { keyPath: "packageId" });
      db.createObjectStore("progress", { keyPath: "packageId" });
      db.createObjectStore("compilations", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const legacy = {
    id: "legacy-draft",
    title: "Legacy",
    kind: "course",
    mcf: "1.1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sourceFiles: ["manifest.yaml"],
    validation: { state: "unchecked", diagnostics: [] },
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put(legacy);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  const store = new IndexedDbLocalStore(name, factory);
  assert.deepEqual(await store.drafts.get("legacy-draft" as never), legacy);
  assert.deepEqual(await store.sync.counts(), {
    drafts: 1,
    library: 0,
    progress: 0,
    compilations: 0,
    localPackages: 0,
  });
  assert.equal((await store.sync.settings()).enabled, false);
  assert.deepEqual(await store.sync.outbox(), []);
});

test("v4 to v6 adds durable sync stores without claiming or queuing local data", async () => {
  const factory = new IDBFactory();
  const name = "sync-migration-test";
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, 4);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("drafts", { keyPath: "id" });
      db.createObjectStore("packages", { keyPath: "id" });
      db.createObjectStore("library", { keyPath: "packageId" });
      db.createObjectStore("progress", { keyPath: "packageId" });
      db.createObjectStore("compilations", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const localOnly = {
    schema: 1,
    id: "unclaimed",
    title: "Unclaimed",
    kind: "lesson",
    mcf: "1.1",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    revision: 1,
    sourceFiles: [],
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put(localOnly);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();

  const store = new IndexedDbLocalStore(name, factory);
  assert.deepEqual(await store.drafts.get("unclaimed" as never), localOnly);
  assert.equal((await store.sync.settings()).enabled, false);
  assert.equal((await store.sync.records()).length, 0);
  assert.equal((await store.sync.outbox()).length, 0);
});

test("provider credentials persist on this device and remain outside account sync", async () => {
  const factory = new IDBFactory();
  const name = "provider-credential-test";
  const store = new IndexedDbLocalStore(name, factory);
  await store.sync.configure({ enabled: true, userId: "user-1" });
  const credential = {
    providerId: OPENROUTER_PROVIDER_ID,
    secret: "sk-or-v1-fake-test-credential",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  };

  await store.credentials.put(credential);
  await store.credentials.selectModel(
    OPENROUTER_PROVIDER_ID,
    "example/selected-model",
  );

  const reloaded = new IndexedDbLocalStore(name, factory);
  assert.equal(
    await reloaded.credentials.selectedModel(OPENROUTER_PROVIDER_ID),
    "example/selected-model",
  );
  assert.equal(
    (await reloaded.credentials.get(OPENROUTER_PROVIDER_ID))?.secret,
    credential.secret,
  );
  assert.deepEqual(await reloaded.sync.records(), []);
  assert.deepEqual(await reloaded.sync.outbox(), []);
  assert.deepEqual(await reloaded.sync.counts(), {
    drafts: 0,
    library: 0,
    progress: 0,
    compilations: 0,
    localPackages: 0,
  });

  await reloaded.credentials.remove(OPENROUTER_PROVIDER_ID);
  assert.equal(
    await reloaded.credentials.get(OPENROUTER_PROVIDER_ID),
    undefined,
  );
  assert.equal(
    await reloaded.credentials.selectedModel(OPENROUTER_PROVIDER_ID),
    undefined,
  );
});

test("provider credentials never enter serialized draft or MCF package state", async () => {
  const store = new IndexedDbLocalStore(
    "provider-package-isolation-test",
    new IDBFactory(),
  );
  const secret = "sk-or-v1-fake-package-isolation-test";
  await store.credentials.put({
    providerId: OPENROUTER_PROVIDER_ID,
    secret,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  });
  const draft = {
    schema: 1,
    id: draftId("provider-isolation-draft"),
    title: "Provider isolation",
    kind: "course",
    mcf: "1.1",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    revision: 1,
    sourceFiles: [],
    sourceMode: "generated",
    visualEditing: "supported",
    editor: { section: "content", previewSize: "desktop" },
    commands: [],
    validation: { state: "unchecked", diagnostics: [] },
  } satisfies PackageDraft;
  await store.drafts.put(draft);

  const packageState = JSON.stringify(await store.drafts.list());
  const syncPackageState = JSON.stringify(
    await store.sync.value("draft", draft.id),
  );
  assert.ok(!packageState.includes(secret));
  assert.ok(!syncPackageState.includes(secret));
  assert.ok(!packageState.includes("providerCredentials"));
});
