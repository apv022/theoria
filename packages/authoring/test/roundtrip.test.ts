import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validatePackage } from "mcf-npm/package";
import {
  countPackage,
  createDeterministicArchive,
  extractSafeArchive,
  type ReaderPackage,
  type SerializedFile,
} from "@theoria/mcf-browser";
import { packageId } from "@theoria/package-model";
import {
  draftFromResult,
  draftInput,
  fileText,
  generatedFiles,
  newPackageFiles,
  updatePackageMetadata,
} from "../src/index";

const bytes = (value: Uint8Array): ArrayBuffer =>
  value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;

async function validateFiles(files: readonly SerializedFile[]) {
  const directory = await mkdtemp("/home/apv/theoria/.authoring-test-");
  try {
    for (const file of files) {
      const target = path.join(directory, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, new Uint8Array(file.bytes));
    }
    return await validatePackage(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const serialized = (
  files: readonly { readonly path: string; readonly bytes: ArrayBuffer }[],
): SerializedFile[] =>
  files.map((file) => ({ path: file.path, bytes: file.bytes.slice(0) }));

test("new course, module, and lesson source validates through the real parser", async () => {
  for (const kind of ["course", "module", "lesson"] as const) {
    const files = newPackageFiles(kind, `New ${kind}`, `new-${kind}`);
    const result = await validateFiles(serialized(files));
    assert.equal(
      result.valid,
      true,
      result.diagnostics
        .map((item) => `${item.code}: ${item.message}`)
        .join("\n"),
    );
    assert.equal(result.package?.kind, kind);
    assert.deepEqual(countPackage(result.package!), {
      lessons: 1,
      activities: 1,
      questions: 0,
    });
  }
});

test("visual metadata generation round-trips without phantom content", async () => {
  const original = await validatePackage(
    "/home/apv/examplecourses/archives/feature-showcase.mcf.zip",
  );
  assert.ok(original.valid && original.package);
  const before = countPackage(original.package);
  const changed = updatePackageMetadata(original.package, {
    title: "Edited feature showcase",
  });
  const archive = await readFile(
    "/home/apv/examplecourses/archives/feature-showcase.mcf.zip",
  );
  const assets = extractSafeArchive(new Uint8Array(archive))
    .filter(
      (file) =>
        file.path !== "manifest.yaml" &&
        !file.path.endsWith(".mcf") &&
        !file.path.endsWith("/chapter.yaml"),
    )
    .map((file) => ({ path: file.path, bytes: bytes(file.bytes) }));
  const files = [...generatedFiles(changed), ...assets];
  const reparsed = await validateFiles(serialized(files));
  assert.equal(
    reparsed.valid,
    true,
    reparsed.diagnostics
      .map((item) => `${item.code}: ${item.message}`)
      .join("\n"),
  );
  assert.equal(reparsed.package?.title, "Edited feature showcase");
  assert.equal(reparsed.package?.kind, original.package.kind);
  assert.deepEqual(countPackage(reparsed.package!), before);
  assert.equal(files.filter((file) => file.path.endsWith(".mcf")).length, 1);
});

test("source-first imports preserve every byte, asset, kind, and literal marker", async () => {
  const fixtures = [
    "/home/apv/examplecourses/archives/minimal.mcf.zip",
    "/home/apv/examplecourses/archives/standalone-module.mcf.zip",
    "/home/apv/examplecourses/archives/standalone-lesson.mcf.zip",
    "/home/apv/examplecourses/archives/feature-showcase.mcf.zip",
    "/home/apv/mcf-authoring-masterclass.mcf.zip",
  ];
  for (const fixture of fixtures) {
    const archive = await readFile(fixture);
    const sourceFiles = extractSafeArchive(new Uint8Array(archive)).map(
      (file) => ({ path: file.path, bytes: bytes(file.bytes) }),
    );
    const parsed = await validatePackage(fixture);
    assert.ok(parsed.valid && parsed.package);
    const counts = countPackage(parsed.package);
    const sourceArchive = createDeterministicArchive(
      sourceFiles.map((file) => ({
        path: file.path,
        bytes: new Uint8Array(file.bytes),
      })),
    );
    const result = {
      requestId: "fixture",
      operation: "inspect",
      status: "ok",
      summary: {
        manifest: {
          mcf: parsed.package.mcf,
          kind: parsed.package.kind,
          id: packageId(parsed.package.id),
          title: parsed.package.title,
          language: parsed.package.language,
          version: parsed.package.version ?? "0.0.0",
          authors: (parsed.package.authors ?? []).map((name) => ({ name })),
        },
        lessonCount: counts.lessons,
        activityCount: counts.activities,
        questionCount: counts.questions,
        sourceChecksum: "fixture",
        sourceSize: sourceArchive.byteLength,
      },
      readerPackage: parsed.package as ReaderPackage,
      sourceFiles,
      validation: { state: "valid", diagnostics: [] },
      diagnostics: [],
      sourceArchive: bytes(sourceArchive),
    } as const;
    const draft = draftFromResult(result, { imported: true });
    const input = draftInput(draft);
    assert.equal(input.type, "directory");
    if (input.type === "directory") {
      assert.deepEqual(
        input.files.map((file) => [file.path, new Uint8Array(file.bytes)]),
        sourceFiles.map((file) => [file.path, new Uint8Array(file.bytes)]),
      );
    }
    assert.equal(
      draft.kind,
      parsed.package.kind,
      "package kind must survive import",
    );
  }

  const masterclass = await readFile(
    "/home/apv/mcf-authoring-masterclass.mcf.zip",
  );
  const masterclassFiles = extractSafeArchive(new Uint8Array(masterclass));
  assert.ok(
    masterclassFiles.some(
      (file) =>
        file.path.endsWith(".mcf") &&
        fileText({
          path: file.path,
          kind: "text",
          bytes: bytes(file.bytes),
        }).includes("    :::mcf-activity"),
    ),
  );
});
