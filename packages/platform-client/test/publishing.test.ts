import type { SupabaseClient, User } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createSupabasePlatformClient,
  PlatformOperationError,
  type PublishingRequest,
  type SupabaseDatabase,
} from "../src/index.js";
import type { PackageId } from "@theoria/package-model";

const ownerId = "10000000-0000-4000-8000-000000000001";
const archive = new Blob(["canonical MCF source"], {
  type: "application/zip",
});
const checksum = createHash("sha256")
  .update("canonical MCF source")
  .digest("hex");

const request = (
  overrides: Partial<PublishingRequest> = {},
): PublishingRequest => ({
  slug: "pilot-course",
  title: "Pilot course",
  description: "A validated package",
  visibility: "private",
  version: "1.0.0",
  mcfVersion: "1.1",
  packageKind: "course",
  sourceChecksum: checksum,
  manifestSummary: {
    mcf: "1.1",
    kind: "course",
    id: "pilot-course" as PackageId,
    title: "Pilot course",
    version: "1.0.0",
    language: "en",
    authors: [],
    entry: "course.yaml",
  },
  validationSummary: { state: "valid", diagnostics: [] },
  releaseNotes: "First release",
  archive,
  ...overrides,
});

class FakePublishingSupabase {
  user: User | null = { id: ownerId } as User;
  failNextUpload = false;
  readonly objects = new Map<string, Blob>();
  readonly releases = new Map<string, string>();
  readonly removed: string[] = [];

  readonly auth = {
    getUser: async () => ({ data: { user: this.user }, error: null }),
  };

  readonly storage = {
    from: () => ({
      upload: async (path: string, source: Blob) => {
        if (this.failNextUpload) {
          this.failNextUpload = false;
          return { data: null, error: new Error("temporary upload failure") };
        }
        if (this.objects.has(path))
          return { data: null, error: new Error("object already exists") };
        this.objects.set(path, source);
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        for (const path of paths) {
          this.objects.delete(path);
          this.removed.push(path);
        }
        return { data: paths, error: null };
      },
    }),
  };

  async rpc(name: string, args: Record<string, unknown>) {
    if (name === "package_slug_available")
      return {
        data: ![...this.releases.values()].includes(String(args.candidate)),
        error: null,
      };
    if (name === "package_version_available") {
      const key = `${String(args.candidate_package_id)}:${String(args.candidate_version)}`;
      return { data: !this.releases.has(key), error: null };
    }
    const key = `${String(args.requested_package_id)}:${String(args.requested_version)}`;
    if (this.releases.has(key))
      return { data: null, error: new Error("23505 version already exists") };
    this.releases.set(key, String(args.requested_slug));
    return {
      data: [
        {
          package_id: String(args.requested_package_id),
          version_id: crypto.randomUUID(),
          slug: String(args.requested_slug),
          version: String(args.requested_version),
          published_at: "2026-07-30T00:00:00.000Z",
        },
      ],
      error: null,
    };
  }
}

const platform = (fake: FakePublishingSupabase) =>
  createSupabasePlatformClient(
    fake as unknown as SupabaseClient<SupabaseDatabase>,
  );

test("publishes first and second immutable versions with progress", async () => {
  const fake = new FakePublishingSupabase();
  const client = platform(fake);
  const phases: string[] = [];
  const first = await client.publishing.publish(request(), {
    onProgress: (phase) => phases.push(phase),
  });
  const second = await client.publishing.publish(
    request({
      packageId: first.packageId,
      version: "1.0.1",
      manifestSummary: {
        ...request().manifestSummary,
        version: "1.0.1",
      },
    }),
  );
  assert.equal(first.slug, "pilot-course");
  assert.equal(second.version, "1.0.1");
  assert.equal(fake.objects.size, 2);
  assert.deepEqual(phases, ["checking", "uploading", "finalizing", "complete"]);
});

test("rejects validation errors and checksum mismatch before upload", async () => {
  const fake = new FakePublishingSupabase();
  const client = platform(fake);
  await assert.rejects(
    client.publishing.publish(
      request({
        validationSummary: {
          state: "invalid",
          diagnostics: [
            {
              code: "INVALID",
              severity: "error",
              message: "Invalid package",
              file: "manifest.yaml",
            },
          ],
        },
      }),
    ),
    (reason: unknown) =>
      reason instanceof PlatformOperationError &&
      reason.code === "VALIDATION_REQUIRED",
  );
  await assert.rejects(
    client.publishing.publish(request({ sourceChecksum: "0".repeat(64) })),
    (reason: unknown) =>
      reason instanceof PlatformOperationError &&
      reason.code === "CHECKSUM_MISMATCH",
  );
  assert.equal(fake.objects.size, 0);
});

test("upload failures are retryable and duplicate versions are rejected", async () => {
  const fake = new FakePublishingSupabase();
  fake.failNextUpload = true;
  const client = platform(fake);
  await assert.rejects(
    client.publishing.publish(request()),
    (reason: unknown) =>
      reason instanceof PlatformOperationError &&
      reason.code === "UPLOAD_FAILED" &&
      reason.retryable,
  );
  const published = await client.publishing.publish(request());
  assert.equal(published.version, "1.0.0");
  const objectCount = fake.objects.size;
  await assert.rejects(
    client.publishing.publish(
      request({
        packageId: published.packageId,
        archive: new Blob(["canonical MCF source"], {
          type: "application/zip",
        }),
      }),
    ),
    (reason: unknown) =>
      reason instanceof PlatformOperationError &&
      reason.code === "VERSION_CONFLICT",
  );
  assert.equal(fake.objects.size, objectCount);
});

test("signed-out clients cannot publish", async () => {
  const fake = new FakePublishingSupabase();
  fake.user = null;
  await assert.rejects(
    platform(fake).publishing.publish(request()),
    (reason: unknown) =>
      reason instanceof PlatformOperationError &&
      reason.code === "AUTH_REQUIRED",
  );
});
