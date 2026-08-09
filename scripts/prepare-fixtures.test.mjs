import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  discoverFixtures,
  manifestIdentity,
  prepareFixtures,
} from "./prepare-fixtures.mjs";

test("manifest identity distinguishes MCF 1.0 and 1.1 defaults", () => {
  assert.deepEqual(manifestIdentity("mcf: '1.0'\nid: sample"), {
    mcfVersion: "1.0",
    packageKind: "course",
  });
  assert.deepEqual(manifestIdentity('mcf: "1.1"\nkind: lesson'), {
    mcfVersion: "1.1",
    packageKind: "lesson",
  });
});

test("fixture discovery is repository-owned and representative", async () => {
  const fixtures = await discoverFixtures();
  assert.deepEqual(
    fixtures.map((item) => item.source),
    [
      "minimal-1.0",
      "minimal-1.1",
      "standalone-module",
      "standalone-lesson",
      "feature-showcase",
      "stress",
    ],
  );
  assert.ok(
    fixtures.every((item) => item.sourcePath.includes("fixtures/sources/")),
  );
});

test("preparation generates deterministic, valid fixtures", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "theoria-fixtures-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  const firstIndex = await prepareFixtures({ destination: first });
  const secondIndex = await prepareFixtures({ destination: second });
  assert.equal(firstIndex.fixtures.length, 6);
  assert.ok(
    firstIndex.fixtures.every((item) => item.validation.status === "valid"),
  );
  assert.deepEqual(firstIndex, secondIndex);
  for (const fixture of firstIndex.fixtures) {
    if (fixture.packageType !== "archive") continue;
    const firstBytes = await readFile(
      path.join(first, path.basename(fixture.copiedPath)),
    );
    const secondBytes = await readFile(
      path.join(second, path.basename(fixture.copiedPath)),
    );
    assert.deepEqual(firstBytes, secondBytes);
  }
});
