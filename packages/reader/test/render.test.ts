import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import type { ReaderStructure } from "../src/model";

const readerFixture = () => {
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
  return { lesson, course };
};

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
  const { lesson, course } = readerFixture();
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

test("each authored TeX expression produces exactly one KaTeX root without raw TeX", async () => {
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
  const { lesson, course } = readerFixture();
  const cases = [
    ["$4^3=64$", 1],
    ["$x_1+x_2$", 1],
    ["$\\frac{1}{2}$", 1],
    ["$\\sqrt{x}$", 1],
    ["$12\\times4$", 1],
    ["$50\\%$", 1],
    ["$$\nf(x)=x^2\n$$", 1],
    ["Price: \\$5 and `code $x$`.", 0],
    ["```tex\n$x$\n```", 0],
    ["Malformed $\\frac{1}$ remains text.", 0],
    ["*Emphasis $x_1$* and $x_2$ plus $x_3$.", 3],
  ] as const;
  for (const [source, expected] of cases) {
    const rendered = renderRichContent(source, lesson, course, () => undefined);
    const container = dom.window.document.createElement("div");
    container.innerHTML = rendered.html;
    assert.equal(
      container.querySelectorAll(".katex").length,
      expected,
      `KaTeX roots for ${source}`,
    );
    assert.equal(
      container.querySelectorAll(".katex-mathml").length,
      expected,
      `accessible math nodes for ${source}`,
    );
    assert.equal(
      container.querySelectorAll('.katex-html[aria-hidden="true"]').length,
      expected,
      `visual math nodes for ${source}`,
    );
    if (expected) assert.doesNotMatch(container.textContent ?? "", /\$\$/);
  }
});
