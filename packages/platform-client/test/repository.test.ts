import type { SupabaseClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabasePlatformClient,
  type SupabaseDatabase,
} from "../src/index.js";

const row = (
  id: string,
  title: string,
  publishedAt: string,
): SupabaseDatabase["public"]["Functions"]["repository_packages"]["Returns"][number] => ({
  package_id: id,
  owner_id: "10000000-0000-4000-8000-000000000001",
  slug: title.toLowerCase().replaceAll(" ", "-"),
  title,
  description: `${title} description`,
  visibility: "public",
  latest_version_id: `${id.slice(0, 8)}-1000-4000-8000-000000000001`,
  package_created_at: publishedAt,
  package_updated_at: publishedAt,
  profile_id: "10000000-0000-4000-8000-000000000001",
  creator_handle: "repository_author",
  creator_display_name: "Repository Author",
  creator_bio: "Public biography",
  creator_avatar_path: null,
  creator_created_at: "2026-07-01T00:00:00.000Z",
  creator_updated_at: "2026-07-01T00:00:00.000Z",
  version_id: `${id.slice(0, 8)}-1000-4000-8000-000000000001`,
  version: "1.0.0",
  mcf_version: "1.1",
  package_kind: "course",
  source_storage_path: `packages/owner/${id}/1.0.0/source.mcf.zip`,
  source_checksum: "a".repeat(64),
  manifest_summary: {
    mcf: "1.1",
    kind: "course",
    id,
    title,
    version: "1.0.0",
    language: "en",
    authors: [],
    subjects: ["mathematics"],
    keywords: ["calculus"],
    level: { identifier: "secondary" },
    learningOutcomes: [{ statement: "Use derivatives." }],
  },
  validation_summary: { state: "valid", diagnostics: [] },
  release_notes: "",
  published_at: publishedAt,
  total_count: 2,
});

class FakeRepositorySupabase {
  calls: { readonly name: string; readonly args: Record<string, unknown> }[] =
    [];

  async rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    if (name === "repository_subjects")
      return {
        data: [
          { subject: "mathematics", package_count: 2 },
          { subject: "science", package_count: 1 },
        ],
        error: null,
      };
    return {
      data: [
        row(
          "aaaaaaaa-0000-4000-8000-000000000001",
          "Calculus",
          "2026-07-30T00:00:00.000Z",
        ),
        row(
          "bbbbbbbb-0000-4000-8000-000000000002",
          "Geometry",
          "2026-07-29T00:00:00.000Z",
        ),
      ],
      error: null,
    };
  }
}

const platform = (fake: FakeRepositorySupabase) =>
  createSupabasePlatformClient(
    fake as unknown as SupabaseClient<SupabaseDatabase>,
  );

test("search passes canonical filters and returns pagination metadata", async () => {
  const fake = new FakeRepositorySupabase();
  const result = await platform(fake).repository.search({
    text: "derivative",
    subject: "Mathematics",
    level: "Secondary",
    language: "EN",
    kind: "course",
    mcfVersion: "1.1",
    sort: "relevance",
    page: 2,
    pageSize: 1,
  });
  assert.equal(result.total, 2);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.packages[0]?.creator.handle, "repository_author");
  assert.deepEqual(result.packages[0]?.versions[0]?.manifestSummary.subjects, [
    "mathematics",
  ]);
  assert.deepEqual(fake.calls[0]?.args, {
    requested_query: "derivative",
    requested_subject: "mathematics",
    requested_level: "secondary",
    requested_language: "en",
    requested_kind: "course",
    requested_mcf_version: "1.1",
    requested_sort: "relevance",
    requested_profile_handle: "",
    requested_limit: 1,
    requested_offset: 1,
  });
});

test("recent, creator, and subject operations stay bounded and typed", async () => {
  const fake = new FakeRepositorySupabase();
  const client = platform(fake).repository;
  const recent = await client.listRecent(200);
  const creator = await client.listProfilePackages(" Repository_Author ", {
    page: 3,
    pageSize: 6,
  });
  const subjects = await client.listSubjects(200);
  assert.equal(recent.length, 2);
  assert.equal(creator.total, 2);
  assert.deepEqual(subjects, [
    { value: "mathematics", packageCount: 2 },
    { value: "science", packageCount: 1 },
  ]);
  assert.equal(fake.calls[0]?.args.requested_limit, 12);
  assert.equal(
    fake.calls[1]?.args.requested_profile_handle,
    "repository_author",
  );
  assert.equal(fake.calls[1]?.args.requested_offset, 12);
  assert.equal(fake.calls[2]?.args.requested_limit, 24);
});
