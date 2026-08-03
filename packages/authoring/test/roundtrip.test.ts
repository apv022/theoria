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
import { draftId, packageId, type PackageDraft } from "@theoria/package-model";
import {
  addDraftAssets,
  draftFromResult,
  draftInput,
  fileText,
  generatedFiles,
  newPackageFiles,
  replaceDraftAsset,
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

test("asset add, collision, replacement, archive, and import preserve bytes and valid MCF integrity", async () => {
  const sourceFiles = newPackageFiles("course", "Asset course", "asset-course");
  const parsed = await validateFiles(serialized(sourceFiles));
  assert.ok(parsed.valid && parsed.package);
  const now = new Date(0).toISOString();
  const draft: PackageDraft = {
    schema: 1,
    id: draftId("asset-draft"),
    title: parsed.package.title,
    kind: parsed.package.kind,
    mcf: parsed.package.mcf,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    sourceFiles,
    normalizedPackage: parsed.package,
    sourceMode: "generated",
    visualEditing: "supported",
    editor: { section: "assets", previewSize: "desktop" },
    commands: [],
    validation: { state: "valid", diagnostics: [] },
  };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 4, 5, 6]);
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
  );
  const added = await addDraftAssets(draft, parsed.package, [
    {
      name: "Diagram final.png",
      type: "",
      bytes: bytes(png),
    },
    {
      name: "Diagram final.png",
      type: "application/octet-stream",
      bytes: bytes(png),
    },
    { name: "vector.svg", type: "image/svg+xml", bytes: bytes(svg) },
  ]);
  const addedPackage = added.normalizedPackage as ReaderPackage;
  assert.deepEqual(
    addedPackage.assets?.map((asset) => asset.source),
    [
      "assets/Diagram final.png",
      "assets/Diagram final-2.png",
      "assets/vector.svg",
    ],
  );
  assert.deepEqual(
    addedPackage.assets?.map((asset) => asset.id),
    ["diagram-final", "diagram-final-2", "vector"],
  );
  assert.ok(
    addedPackage.assets?.every((asset) =>
      /^sha256-[A-Za-z0-9+/]+={0,2}$/.test(String(asset.integrity)),
    ),
  );
  assert.equal(addedPackage.assets?.[0]?.media_type, "image/png");
  const validated = await validateFiles(serialized(added.sourceFiles));
  assert.equal(
    validated.valid,
    true,
    validated.diagnostics.map((item) => item.message).join("\n"),
  );

  const replaced = await replaceDraftAsset(
    added,
    addedPackage,
    "diagram-final",
    { name: "replacement.jpg", type: "image/jpeg", bytes: bytes(jpeg) },
  );
  const replacedPackage = replaced.normalizedPackage as ReaderPackage;
  assert.equal(
    replacedPackage.assets?.find((asset) => asset.id === "diagram-final")
      ?.source,
    "assets/replacement.jpg",
  );
  assert.equal(
    replaced.sourceFiles.some(
      (file) => file.path === "assets/Diagram final.png",
    ),
    false,
  );
  const revalidated = await validateFiles(serialized(replaced.sourceFiles));
  assert.equal(
    revalidated.valid,
    true,
    revalidated.diagnostics.map((item) => item.message).join("\n"),
  );
  const archive = createDeterministicArchive(
    replaced.sourceFiles.map((file) => ({
      path: file.path,
      bytes: new Uint8Array(file.bytes),
    })),
  );
  const imported = extractSafeArchive(archive);
  assert.deepEqual(
    imported.find((file) => file.path === "assets/replacement.jpg")?.bytes,
    jpeg,
  );
  assert.deepEqual(
    imported.find((file) => file.path === "assets/Diagram final-2.png")?.bytes,
    png,
  );
});

test("visual regeneration preserves TeX-rich YAML values through parse and re-export", async () => {
  const initial = await validateFiles(
    serialized(newPackageFiles("lesson", "Math", "math")),
  );
  assert.ok(initial.valid && initial.package?.kind === "lesson");
  const values = [
    "$12\\times 12 = 144$",
    "$\\sqrt{16}=4$",
    "$37\\%=0.37$",
    "$\\frac{1}{2}$",
    "$x_1$",
    "Euler's formula is $e^{i\\pi}+1=0$.",
    "Before $\\frac{1}{2}$, then $\\sqrt{16}$.",
    "$$\n\\sqrt{x^2}=|x|\n$$",
    "no trailing newline\n",
    "two trailing newlines\n\n",
  ];
  const valueAt = (index: number) => values[index]!;
  const pkg = structuredClone(initial.package);
  pkg.lesson.activities = [
    {
      id: "tex",
      type: "practice",
      content: "$$\n\\frac{1}{2}=0.5\n$$",
      questions: [
        ...values.map((prompt, index) => ({
          id: `q-${index + 1}`,
          type: "short_answer" as const,
          prompt,
          answer: "answer",
          points: 1,
          required: true,
          hint: valueAt((index + 1) % values.length),
          explanation: valueAt((index + 2) % values.length),
        })),
        {
          id: "choice",
          type: "multiple_choice" as const,
          prompt: values[0]!,
          answer: "one",
          points: 1,
          required: true,
          options: [
            { id: "one", text: values[1]!, feedback: values[2]! },
            { id: "two", text: values[3]!, feedback: values[4]! },
          ],
        },
        {
          id: "matching",
          type: "matching" as const,
          prompt: values[5]!,
          points: 1,
          required: true,
          premises: [
            { id: "one", text: values[6]!, feedback: values[7]! },
            { id: "two", text: values[8]!, feedback: values[9]! },
          ],
          responses: [
            { id: "a", text: values[0]!, feedback: values[1]! },
            { id: "b", text: values[2]!, feedback: values[3]! },
          ],
          answer: { one: "a", two: "b" },
        },
        {
          id: "ordering",
          type: "ordering" as const,
          prompt: values[4]!,
          points: 1,
          required: true,
          items: [
            { id: "first", text: values[5]!, feedback: values[6]! },
            { id: "second", text: values[7]!, feedback: values[8]! },
          ],
          answer: ["first", "second"],
        },
      ],
    },
  ];
  pkg.lesson.rubrics = [
    {
      id: "tex-rubric",
      title: "TeX rubric",
      description: values[0]!,
      criteria: [
        {
          id: "criterion",
          description: values[1]!,
          levels: [
            { id: "complete", description: values[2]!, points: 1 },
            { id: "retry", description: values[3]!, points: 0 },
          ],
        },
      ],
    },
  ];
  const files = generatedFiles(pkg);
  const lessonSource = fileText(
    files.find((file) => file.path === "lesson.mcf")!,
  );
  assert.match(lessonSource, /prompt: '\$12\\times 12 = 144\$'/);
  assert.match(lessonSource, /prompt: \|-\n\s+\$\$\n\s+\\sqrt/);
  assert.match(lessonSource, /Euler''s formula/);

  const reparsed = await validateFiles(serialized(files));
  assert.ok(reparsed.valid && reparsed.package?.kind === "lesson");
  const questions = reparsed.package.lesson.activities[0]!.questions;
  assert.deepEqual(
    questions.slice(0, values.length).map((question) => question.prompt),
    values,
  );
  assert.deepEqual(
    questions.slice(0, values.length).map((question) => question.hint),
    [...values.slice(1), values[0]],
  );
  assert.deepEqual(
    questions.slice(0, values.length).map((question) => question.explanation),
    [...values.slice(2), values[0], values[1]],
  );
  assert.equal(reparsed.package.lesson.rubrics?.[0]?.description, values[0]);
  assert.equal(
    reparsed.package.lesson.rubrics?.[0]?.criteria[0]?.description,
    values[1],
  );
  assert.equal(
    reparsed.package.lesson.rubrics?.[0]?.criteria[0]?.levels[0]?.description,
    values[2],
  );
  assert.equal(questions[10]?.options?.[0]?.text, values[1]);
  assert.equal(questions[10]?.options?.[0]?.feedback, values[2]);
  assert.equal(questions[11]?.premises?.[0]?.text, values[6]);
  assert.equal(questions[11]?.responses?.[0]?.feedback, values[1]);
  assert.equal(questions[12]?.items?.[0]?.feedback, values[6]);

  const reexported = await validateFiles(
    serialized(generatedFiles(reparsed.package)),
  );
  assert.ok(reexported.valid && reexported.package?.kind === "lesson");
  assert.deepEqual(
    reexported.package.lesson.activities[0]!.questions.slice(
      0,
      values.length,
    ).map((question) => question.prompt),
    values,
  );
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
