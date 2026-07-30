import assert from "node:assert/strict";
import test from "node:test";
import type { McfPackage } from "mcf-npm/model";
import { packageManifestFromMcf } from "../src/worker-core";

test("validated package summaries retain canonical repository metadata", () => {
  const manifest = packageManifestFromMcf({
    mcf: "1.1",
    kind: "lesson",
    id: "metadata-lesson",
    title: "Metadata Lesson",
    language: "en",
    version: "1.0.0",
    authors: ["Example Author"],
    license: "CC-BY-4.0",
    subjects: ["mathematics", "science"],
    keywords: ["calculus", "inquiry"],
    level: { label: "Secondary", identifier: "secondary" },
    estimated_duration: "PT20M",
    learning_outcomes: [
      { id: "explain-change", statement: "Explain rates of change." },
    ],
    root: "/package",
    sourceType: "directory",
    diagnostics: [],
    entry: "lesson.mcf",
    lesson: {
      id: "metadata",
      title: "Metadata",
      source: "lesson.mcf",
      activities: [],
    },
  } as McfPackage);

  assert.deepEqual(manifest.subjects, ["mathematics", "science"]);
  assert.deepEqual(manifest.keywords, ["calculus", "inquiry"]);
  assert.deepEqual(manifest.level, {
    label: "Secondary",
    identifier: "secondary",
  });
  assert.deepEqual(manifest.learningOutcomes, [
    { id: "explain-change", statement: "Explain rates of change." },
  ]);
  assert.equal(manifest.estimatedDuration, "PT20M");
});
