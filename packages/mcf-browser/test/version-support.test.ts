import assert from "node:assert/strict";
import test from "node:test";
import {
  executeEngineRequest,
  mcf10DeprecationMessage,
  unsupportedMcfVersionReason,
} from "../src/worker-core";

const encoded = (value: string): ArrayBuffer =>
  new TextEncoder().encode(value).buffer as ArrayBuffer;

const input = (version: string) => ({
  type: "directory" as const,
  name: `mcf-${version}`,
  files: [
    {
      path: "course/manifest.yaml",
      bytes: encoded(
        `mcf: "${version}"\nkind: course\nid: version-test\ntitle: Version Test\nlanguage: en\nversion: "1.0.0"\nchapters:\n  - source: chapters/start\n`,
      ),
    },
    {
      path: "course/chapters/start/chapter.yaml",
      bytes: encoded(
        "id: start\ntitle: Start\nlessons:\n  - lessons/welcome.mcf\n",
      ),
    },
    {
      path: "course/chapters/start/lessons/welcome.mcf",
      bytes: encoded("---\nid: welcome\ntitle: Welcome\n---\n\nHello\n"),
    },
  ],
});

test("MCF 1.1 remains the supported baseline", () => {
  assert.equal(unsupportedMcfVersionReason("1.1"), undefined);
});

test("MCF 1.0 is rejected with the product deprecation message", async () => {
  const result = await executeEngineRequest(
    "deprecated",
    "compile",
    input("1.0"),
    () => {},
  );
  assert.equal(result.status, "unsupported");
  if (result.status === "unsupported")
    assert.equal(result.reason, mcf10DeprecationMessage);
});

test("future MCF versions fail intentionally without entering the compiler", async () => {
  const result = await executeEngineRequest(
    "future",
    "compile",
    input("9.0"),
    () => {},
  );
  assert.equal(result.status, "unsupported");
  if (result.status === "unsupported") {
    assert.match(result.reason, /MCF 9\.0 is not supported/);
    assert.equal(result.diagnostics[0]?.code, "MCF_VERSION_UNSUPPORTED");
  }
});
