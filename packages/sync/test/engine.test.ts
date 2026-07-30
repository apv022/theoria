import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbLocalStore } from "@theoria/local-store";
import {
  draftId,
  packageId,
  type LearnerProgress,
  type LibraryEntry,
  type PackageDraft,
} from "@theoria/package-model";
import type {
  RemoteSyncCounts,
  RemoteSyncPage,
  RemoteSyncRecord,
  SyncBlobReference,
  SyncClient,
} from "@theoria/platform-client";
import {
  SYNC_ARTIFACT_LIMIT,
  TheoriaSyncEngine,
  mergeProgress,
} from "../src/index";

class FakeRemote implements SyncClient {
  readonly records = new Map<string, RemoteSyncRecord>();
  readonly blobs = new Map<string, Blob>();
  applies = 0;
  uploads = 0;
  cursor = 0;
  failApply = false;

  async registerDevice(): Promise<void> {}

  async counts(): Promise<RemoteSyncCounts> {
    const count = (category: RemoteSyncRecord["category"]) =>
      [...this.records.values()].filter(
        (record) => record.category === category && !record.deleted,
      ).length;
    return {
      drafts: count("draft"),
      progress: count("progress"),
      library: count("library"),
      localPackages: count("local_package"),
      compilations: count("compilation"),
      blobs: this.blobs.size,
      storageBytes: [...this.blobs.values()].reduce(
        (total, blob) => total + blob.size,
        0,
      ),
    };
  }

  async list(cursor: number, limit = 100): Promise<RemoteSyncPage> {
    const rows = [...this.records.values()]
      .filter((record) => record.cursor > cursor)
      .sort((left, right) => left.cursor - right.cursor)
      .slice(0, limit);
    return {
      records: rows,
      nextCursor: rows.at(-1)?.cursor ?? cursor,
      hasMore:
        [...this.records.values()].filter(
          (record) => record.cursor > (rows.at(-1)?.cursor ?? cursor),
        ).length > 0,
    };
  }

  async apply(
    input: Omit<
      RemoteSyncRecord,
      "revision" | "createdAt" | "updatedAt" | "cursor"
    >,
    expectedRevision: number,
  ): Promise<RemoteSyncRecord> {
    if (this.failApply) throw new Error("Session expired.");
    const key = `${input.category}:${input.stableId}`;
    const existing = this.records.get(key);
    if ((existing?.revision ?? 0) !== expectedRevision)
      throw new Error("remote revision conflict");
    this.applies += 1;
    this.cursor += 1;
    const now = new Date(Date.UTC(2026, 7, 1, 0, 0, this.cursor)).toISOString();
    const record: RemoteSyncRecord = {
      ...input,
      revision: expectedRevision + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      cursor: this.cursor,
    };
    this.records.set(key, record);
    return record;
  }

  async uploadBlob(
    reference: Omit<SyncBlobReference, "available">,
    blob: Blob,
  ): Promise<SyncBlobReference> {
    const key = reference.checksum;
    if (!this.blobs.has(key)) {
      this.uploads += 1;
      this.blobs.set(key, blob);
    }
    return {
      ...reference,
      available: true,
      storagePath: `users/user-1/${reference.kind}/${reference.checksum}`,
    };
  }

  async downloadBlob(reference: SyncBlobReference): Promise<Blob> {
    const blob = this.blobs.get(reference.checksum);
    if (!blob) throw new Error("blob missing");
    return blob;
  }
}

const draft = (
  id: string,
  checksum: string,
  title = "Synchronized draft",
): PackageDraft => ({
  schema: 1,
  id: draftId(id),
  title,
  kind: "course",
  mcf: "1.1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  revision: 1,
  sourceFiles: [
    {
      path: "manifest.yaml",
      kind: "text",
      bytes: new TextEncoder().encode(`title: ${title}`).buffer,
    },
  ],
  sourceMode: "generated",
  visualEditing: "supported",
  sourceChecksum: checksum,
  owner: {
    type: "user",
    userId: "user-1",
    claimedAt: "2026-08-01T00:00:00.000Z",
  },
  editor: { section: "content", previewSize: "desktop" },
  commands: [],
  validation: { state: "valid", diagnostics: [] },
});

const store = (name: string): IndexedDbLocalStore =>
  new IndexedDbLocalStore(name, new IDBFactory());

test("planning is read-only and explicit consent uploads owned local data", async () => {
  const local = store("consent");
  const remote = new FakeRemote();
  await local.drafts.put(draft("draft-1", "a".repeat(64)));
  const engine = new TheoriaSyncEngine(local.sync, remote);

  const plan = await engine.plan("user-1");
  assert.equal(plan.local.drafts, 1);
  assert.equal(remote.applies, 0);
  assert.equal((await local.sync.outbox()).length, 0);

  const result = await engine.enable("upload", "user-1");
  assert.equal(result?.uploaded, 1);
  assert.equal(remote.records.size, 1);
  assert.equal((await local.sync.settings()).enabled, true);
});

test("remote-only data restores to another device and disabling keeps it", async () => {
  const remote = new FakeRemote();
  const first = store("first");
  await first.drafts.put(draft("shared", "b".repeat(64)));
  await new TheoriaSyncEngine(first.sync, remote).enable("upload", "user-1");

  const second = store("second");
  const secondEngine = new TheoriaSyncEngine(second.sync, remote);
  await secondEngine.enable("download", "user-1");
  assert.equal(
    (await second.drafts.get(draftId("shared")))?.title,
    "Synchronized draft",
  );
  const restoredSource = (await second.drafts.get(draftId("shared")))
    ?.sourceFiles[0]?.bytes;
  assert.match(new TextDecoder().decode(restoredSource), /Synchronized draft/);
  await secondEngine.disable();
  assert.equal((await second.sync.settings()).enabled, false);
  assert.ok(await second.drafts.get(draftId("shared")));
});

test("independent draft edits preserve a labelled conflict copy", async () => {
  const remote = new FakeRemote();
  const first = store("conflict-first");
  await first.drafts.put(draft("shared", "c".repeat(64)));
  const firstEngine = new TheoriaSyncEngine(first.sync, remote);
  await firstEngine.enable("upload", "user-1");

  const second = store("conflict-second");
  const secondEngine = new TheoriaSyncEngine(second.sync, remote);
  await secondEngine.enable("download", "user-1");
  await second.drafts.put(
    draft("shared", "d".repeat(64), "Second device edit"),
  );
  await first.drafts.put(draft("shared", "e".repeat(64), "First device edit"));
  await firstEngine.syncNow();
  const result = await secondEngine.syncNow();

  assert.equal(result.conflicts, 1);
  const drafts = await second.drafts.list();
  assert.equal(drafts.length, 2);
  assert.ok(drafts.some((value) => value.title.includes("conflict copy")));
  assert.equal((await second.sync.conflicts()).length, 1);
});

const progress = (
  revision: number,
  viewed: readonly string[],
  resetGeneration = 0,
): LearnerProgress => ({
  schema: 1,
  packageId: packageId("package@1.0.0#checksum"),
  packageVersion: "1.0.0",
  contentId: "checksum",
  revision,
  resetGeneration,
  questions: {},
  activities: {},
  assessments: {},
  lessons: {},
  viewedActivities: Object.fromEntries(viewed.map((id) => [id, true])),
  questionOrders: { pool: ["a", "b"] },
  matchingOrders: {},
  orderingOrders: {},
  manualCompletions: {},
  assignmentSubmissions: {},
  startedAt: "2026-08-01T00:00:00.000Z",
  lastOpenedAt: "2026-08-01T00:00:00.000Z",
  updatedAt: `2026-08-01T00:00:0${revision}.000Z`,
});

test("progress merge combines safe facts and respects reset generations", () => {
  const merged = mergeProgress(progress(1, ["one"]), progress(2, ["two"]));
  assert.deepEqual(merged.viewedActivities, { one: true, two: true });
  assert.deepEqual(merged.questionOrders.pool, ["a", "b"]);
  const reset = mergeProgress(progress(4, ["old"], 0), progress(1, [], 1));
  assert.equal(reset.resetGeneration, 1);
  assert.deepEqual(reset.viewedActivities, {});
});

test("package-version progress identities remain isolated", async () => {
  const local = store("progress-versions");
  const remote = new FakeRemote();
  await local.progress.put(progress(1, ["v1"]));
  await local.progress.put({
    ...progress(1, ["v2"]),
    packageId: packageId("package@2.0.0#other-checksum"),
    packageVersion: "2.0.0",
    contentId: "other-checksum",
  });
  await new TheoriaSyncEngine(local.sync, remote).enable("upload", "user-1");
  assert.equal(
    [...remote.records.values()].filter(
      (record) => record.category === "progress",
    ).length,
    2,
  );
});

const libraryEntry = (id: string, addedAt: string): LibraryEntry => ({
  packageId: packageId(id),
  title: id,
  packageKind: "course",
  mcfVersion: "1.1",
  version: "1.0.0",
  addedAt,
  origin: "repository",
  source: {
    type: "package",
    packageRecordId: packageId(`${id}-source`),
  },
});

test("library additions merge as a union and tombstones propagate", async () => {
  const remote = new FakeRemote();
  const first = store("library-first");
  await first.library.put(libraryEntry("alpha", "2026-08-01T00:00:00.000Z"));
  await new TheoriaSyncEngine(first.sync, remote).enable("upload", "user-1");

  const second = store("library-second");
  const secondEngine = new TheoriaSyncEngine(second.sync, remote);
  await secondEngine.enable("download", "user-1");
  await second.library.put(libraryEntry("beta", "2026-08-02T00:00:00.000Z"));
  await secondEngine.syncNow();
  await new TheoriaSyncEngine(first.sync, remote).syncNow();
  assert.deepEqual(
    (await first.library.list()).map((entry) => entry.packageId).sort(),
    ["alpha", "beta"],
  );

  await first.library.delete(packageId("alpha"));
  await new TheoriaSyncEngine(first.sync, remote).syncNow();
  await secondEngine.syncNow();
  assert.equal(await second.library.get(packageId("alpha")), undefined);
});

test("failed authentication preserves a bounded durable outbox", async () => {
  const local = store("expired");
  const remote = new FakeRemote();
  await local.drafts.put(draft("queued", "f".repeat(64)));
  remote.failApply = true;
  const result = await new TheoriaSyncEngine(local.sync, remote).enable(
    "upload",
    "user-1",
  );
  assert.equal(result?.failed, 1);
  const outbox = await local.sync.outbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.status, "failed");
  assert.match(outbox[0]?.lastError ?? "", /expired/i);
});

test("oversized artifacts retain metadata without pretending backup", async () => {
  const local = store("oversized");
  const remote = new FakeRemote();
  await local.compilations.put({
    id: "large-compilation",
    sourceFilename: "large.zip",
    identity: { id: packageId("large"), title: "Large", version: "1.0.0" },
    packageKind: "course",
    mcfVersion: "1.1",
    sourceChecksum: "1".repeat(64),
    compiledArtifact: new Blob([new Uint8Array(SYNC_ARTIFACT_LIMIT + 1)]),
    validation: { state: "valid", diagnostics: [] },
    diagnostics: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    syncState: "local",
  });
  await new TheoriaSyncEngine(local.sync, remote).enable("upload", "user-1");
  const record = remote.records.get("compilation:large-compilation");
  assert.equal(record?.artifactStatus, "metadata_only");
  assert.equal(remote.uploads, 0);
});

test("compilation artifacts deduplicate by checksum across records", async () => {
  const local = store("deduplication");
  const remote = new FakeRemote();
  const compiledArtifact = new Blob(["same immutable output"]);
  const base = {
    sourceFilename: "source.zip",
    identity: { id: packageId("dedupe"), title: "Dedupe", version: "1.0.0" },
    packageKind: "course" as const,
    mcfVersion: "1.1" as const,
    sourceChecksum: "2".repeat(64),
    compiledArtifact,
    validation: { state: "valid" as const, diagnostics: [] },
    diagnostics: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    syncState: "local" as const,
  };
  await local.compilations.put({ ...base, id: "compilation-one" });
  await local.compilations.put({ ...base, id: "compilation-two" });
  await new TheoriaSyncEngine(local.sync, remote).enable("upload", "user-1");
  assert.equal(remote.uploads, 1);
  assert.equal(remote.records.size, 2);
});
