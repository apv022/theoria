import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import {
  packageId,
  type CompilationRecord,
  type LearnerProgress,
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

test("v2 to v3 migration preserves compilation history and adds no destructive changes", async () => {
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
