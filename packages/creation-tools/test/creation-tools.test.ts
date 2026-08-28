import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { providerId, type AIProvider } from "@theoria/ai-provider";
import { generatedFiles } from "@theoria/authoring";
import { validatePackage } from "mcf-npm/package";
import {
  duplicateReasons,
  factoryCandidatePackage,
  generateFactoryCourse,
  mapWithConcurrency,
  parseFactoryCandidate,
  type FactoryBrief,
} from "../src/index";

const brief: FactoryBrief = {
  title: "Climate basics",
  description: "An introduction",
  subject: "Science",
  learner: "Beginner",
  alignment: "",
  instructions: "Use two short lessons.",
  sourceMaterial: "Climate describes long-term weather patterns.",
};

const candidate = JSON.stringify({
  title: "Climate basics",
  description: "An introduction",
  chapters: [
    {
      title: "Foundations",
      lessons: [
        {
          title: "Weather and climate",
          description: "Compare the terms.",
          sections: [
            {
              title: "Difference",
              content: "# Difference\n\nLong-term patterns.",
            },
          ],
        },
      ],
    },
  ],
});

const provider = (outputs: readonly string[]): AIProvider => {
  let cursor = 0;
  const id = providerId("test");
  return {
    id,
    name: "Test",
    async connectionStatus() {
      return { status: "connected", providerId: id, connectedAt: "now" };
    },
    async listModels() {
      return [{ id: "model", providerId: id, name: "Model" }];
    },
    async generate() {
      return {
        text: outputs[cursor++] ?? "",
        modelId: "model",
        finishReason: "stop",
      };
    },
  };
};

test("valid structured generation becomes a deterministic MCF 1.1 course", async () => {
  const result = await generateFactoryCourse({
    provider: provider([candidate]),
    modelId: "model",
    brief,
    validate: async (value) => ({ ok: true, artifact: value, diagnostics: [] }),
  });
  const pkg = factoryCandidatePackage(result.candidate, brief);
  assert.equal(pkg.mcf, "1.1");
  assert.equal(pkg.kind, "course");
  assert.equal(
    pkg.chapters[0]?.lessons[0]?.activities[0]?.content,
    "# Difference\n\nLong-term patterns.",
  );

  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const directory = await mkdtemp(path.join(root, ".factory-test-"));
  try {
    for (const file of generatedFiles(pkg)) {
      const target = path.join(directory, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, new Uint8Array(file.bytes));
    }
    const validation = await validatePackage(directory);
    assert.equal(
      validation.valid,
      true,
      validation.diagnostics.map((item) => item.message).join("\n"),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("malformed output repairs once and never loops indefinitely", async () => {
  let validations = 0;
  const result = await generateFactoryCourse({
    provider: provider(["not json", candidate]),
    modelId: "model",
    brief,
    validate: async (value) => {
      validations += 1;
      return { ok: true, artifact: value, diagnostics: [] };
    },
  });
  assert.equal(result.attempts, 2);
  assert.equal(validations, 1);
  await assert.rejects(
    generateFactoryCourse({
      provider: provider(["bad", "still bad", candidate]),
      modelId: "model",
      brief,
      validate: async (value) => ({
        ok: true,
        artifact: value,
        diagnostics: [],
      }),
    }),
    /stopped after 2 attempts/,
  );
});

test("validator rejection drives one targeted repair", async () => {
  let validations = 0;
  const result = await generateFactoryCourse({
    provider: provider([candidate, candidate]),
    modelId: "model",
    brief,
    validate: async (value) => {
      validations += 1;
      return validations === 1
        ? { ok: false, diagnostics: ["MCF rule failed"] }
        : { ok: true, artifact: value, diagnostics: [] };
    },
  });
  assert.equal(result.attempts, 2);
  assert.equal(validations, 2);
});

test("candidate parser rejects missing instructional structure", () => {
  assert.throws(() => parseFactoryCandidate('{"title":"Empty","chapters":[]}'));
});

test("duplicate detection uses checksums and package identity, never title", () => {
  const reasons = duplicateReasons([
    { key: "one", checksum: "a", packageId: "p", version: "1.0.0" },
    { key: "same-bytes", checksum: "a", packageId: "other", version: "2.0.0" },
    { key: "same-version", checksum: "b", packageId: "p", version: "1.0.0" },
    {
      key: "same-title-is-irrelevant",
      checksum: "c",
      packageId: "q",
      version: "1.0.0",
    },
  ]);
  assert.match(reasons.get("same-bytes")!, /checksum/);
  assert.match(reasons.get("same-version")!, /package ID and version/);
  assert.equal(reasons.has("same-title-is-irrelevant"), false);
});

test("bounded concurrency never exceeds the worker limit", async () => {
  let active = 0;
  let maximum = 0;
  const result = await mapWithConcurrency(
    [1, 2, 3, 4, 5, 6],
    3,
    async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    },
  );
  assert.deepEqual(result, [2, 4, 6, 8, 10, 12]);
  assert.equal(maximum, 3);
});
