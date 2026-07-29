import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  discoverFixtures,
  manifestIdentity,
  prepareFixtures,
} from "./prepare-fixtures.mjs";

const exec = promisify(execFile);

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

test("fixture discovery requires all three representative sources", async () => {
  const fixtures = await discoverFixtures();
  assert.equal(fixtures.length, 3);
  assert.ok(fixtures.some((item) => item.name.includes("1.0")));
  assert.ok(fixtures.some((item) => item.name.includes("1.1")));
  assert.ok(fixtures.some((item) => item.name.includes("masterclass")));
});

test("preparation copies sources and writes a truthful index", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "theoria-fixtures-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const one = path.join(temporary, "one");
  await mkdir(one);
  await writeFile(path.join(one, "manifest.yaml"), "mcf: '1.0'\nid: one\n");
  const smallSource = path.join(temporary, "small");
  const masterSource = path.join(temporary, "master");
  await mkdir(smallSource);
  await mkdir(masterSource);
  await writeFile(
    path.join(smallSource, "manifest.yaml"),
    "mcf: '1.1'\nkind: course\n",
  );
  await writeFile(
    path.join(masterSource, "manifest.yaml"),
    "mcf: '1.1'\nkind: course\n",
  );
  const small = path.join(temporary, "small.mcf.zip");
  const master = path.join(temporary, "master.mcf.zip");
  await exec("zip", ["-q", "-r", small, "manifest.yaml"], { cwd: smallSource });
  await exec("zip", ["-q", "-r", master, "manifest.yaml"], {
    cwd: masterSource,
  });
  const destination = path.join(temporary, "output");
  const index = await prepareFixtures({
    destination,
    sources: { mcf10: one, mcf11Small: small, masterclass: master },
  });
  assert.equal(index.fixtures.length, 3);
  const disk = JSON.parse(
    await readFile(path.join(destination, "index.json"), "utf8"),
  );
  assert.deepEqual(
    disk.fixtures.map((item) => item.mcfVersion),
    ["1.0", "1.1", "1.1"],
  );
  assert.ok(disk.fixtures.every((item) => item.archiveSizeBytes > 0));
});
