import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import type { ReaderStructure } from "../src/model";

test("rich content resolves declared assets, preserves code, and removes unsafe HTML", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://theoria.local/",
  });
  Object.defineProperty(globalThis, "window", {
    value: dom.window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: dom.window.document,
    configurable: true,
  });
  Object.defineProperty(globalThis, "Node", {
    value: dom.window.Node,
    configurable: true,
  });
  const { renderRichContent } = await import("../src/render");
  const lesson = {
    id: "lesson",
    title: "Lesson",
    source: "chapters/one/lesson.mcf",
    activities: [],
  } as ReaderStructure["chapters"][number]["lessons"][number];
  const course = {
    id: "course",
    title: "Course",
    version: "1",
    mcf: "1.1",
    kind: "course",
    language: "en",
    chapters: [{ id: "one", title: "One", source: "", lessons: [lesson] }],
    assets: [{ id: "diagram", source: "assets/diagram.svg" }],
    rubrics: [],
    root: "",
  } as ReaderStructure;
  const rendered = renderRichContent(
    [
      "![Diagram](asset:diagram)",
      "",
      "```mcf",
      ":::mcf-question",
      "<script>literal</script>",
      "```",
      "",
      '<img src=x onerror="globalThis.pwned=true">',
      "",
      "[remote](https://example.com)",
    ].join("\n"),
    lesson,
    course,
    (path) => (path === "assets/diagram.svg" ? "blob:safe-diagram" : undefined),
  );
  assert.match(rendered.html, /blob:safe-diagram/);
  assert.match(rendered.html, /:::mcf-question/);
  assert.doesNotMatch(rendered.html, /onerror/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /noopener noreferrer/);
  assert.equal(rendered.hasRemoteResources, true);
});
