import assert from "node:assert/strict";
import test from "node:test";
import { zipSync } from "fflate";
import {
  ArchiveSecurityError,
  createDeterministicArchive,
  extractSafeArchive,
  isSafePackagePath,
  normalizeDirectoryFiles,
} from "../src/archive";

const bytes = (value: string) => new TextEncoder().encode(value);
const arrayBuffer = (value: Uint8Array) =>
  value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;

test("package paths reject traversal, absolute, Windows, and control paths", () => {
  for (const value of [
    "../manifest.yaml",
    "/manifest.yaml",
    "C:/manifest.yaml",
    "a\\b",
    "a//b",
    "a/\0b",
  ]) {
    assert.equal(isSafePackagePath(value), false, value);
  }
  assert.equal(isSafePackagePath("chapters/start/lesson.mcf"), true);
});

test("safe ZIP extraction reads a package and deterministic archive is stable", () => {
  const source = zipSync({
    "manifest.yaml": bytes("mcf: '1.1'\nkind: course\n"),
    "lessons/one.mcf": bytes("---\nid: one\n---\n"),
  });
  const files = extractSafeArchive(source);
  assert.equal(files.length, 2);
  assert.deepEqual(
    createDeterministicArchive(files),
    createDeterministicArchive(files),
  );
});

test("hostile ZIP traversal and executable entries are rejected", () => {
  for (const [name, code] of [
    ["../escape.mcf", "MCF_PATH_TRAVERSAL"],
    ["assets/run.js", "MCF_UNSAFE_CONTENT"],
  ] as const) {
    const archive = zipSync({
      "manifest.yaml": bytes("mcf: '1.1'"),
      [name]: bytes("x"),
    });
    assert.throws(
      () => extractSafeArchive(archive),
      (error: unknown) =>
        error instanceof ArchiveSecurityError && error.code === code,
    );
  }
});

test("unsafe active SVG is rejected", () => {
  const archive = zipSync({
    "manifest.yaml": bytes("mcf: '1.1'"),
    "assets/bad.svg": bytes('<svg onload="alert(1)"><script>x</script></svg>'),
  });
  assert.throws(
    () => extractSafeArchive(archive),
    (error: unknown) =>
      error instanceof ArchiveSecurityError &&
      error.code === "MCF_UNSAFE_CONTENT",
  );
});

test("directory imports strip one picker root and retain source bytes", () => {
  const files = normalizeDirectoryFiles([
    { path: "course/manifest.yaml", bytes: arrayBuffer(bytes("mcf: '1.0'")) },
    { path: "course/lesson.mcf", bytes: arrayBuffer(bytes("lesson")) },
  ]);
  assert.deepEqual(
    files.map((file) => file.path),
    ["manifest.yaml", "lesson.mcf"],
  );
});

test("single nested package paths are never mistaken for picker roots", () => {
  const content = bytes("binary content");
  const files = normalizeDirectoryFiles([
    { path: "assets/image with spaces.png", bytes: arrayBuffer(content) },
  ]);
  assert.equal(files[0]?.path, "assets/image with spaces.png");
  assert.deepEqual(files[0]?.bytes, content);
});
