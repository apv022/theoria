import assert from "node:assert/strict";
import test from "node:test";
import type { Course } from "mcf-npm/model";
import { unzipSync } from "fflate";
import {
  compileLearnerPackage,
  countPackage,
  renderSafeMarkdown,
} from "../src/compiler";

const course: Course = {
  mcf: "1.1",
  kind: "course",
  id: "test-course",
  title: "Test <Course>",
  language: "en",
  root: "/package",
  diagnostics: [],
  sourceType: "directory",
  chapters: [
    {
      id: "start",
      title: "Start",
      source: "chapters/start",
      lessons: [
        {
          id: "one",
          title: "One",
          source: "chapters/start/one.mcf",
          activities: [
            {
              id: "notes",
              type: "notes",
              content:
                "```mcf-question\nid: phantom\n```\n\nLiteral asset:missing",
              questions: [
                {
                  id: "real",
                  type: "short_answer",
                  prompt: "Real?",
                  answer: "yes",
                  points: 1,
                  required: true,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test("counts reflect parsed objects and not literal fenced examples", () => {
  assert.deepEqual(countPackage(course), {
    lessons: 1,
    activities: 1,
    questions: 1,
  });
});

test("safe Markdown escapes HTML while preserving literal examples", () => {
  const html = renderSafeMarkdown(
    "<script>x</script>\n\n```mcf-question\nid: phantom\n```",
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("id: phantom"));
});

test("repeated compilation is byte-stable and learner-renderable", () => {
  const first = compileLearnerPackage(course, []);
  const second = compileLearnerPackage(course, []);
  assert.deepEqual(first, second);
  const files = unzipSync(first);
  const html = new TextDecoder().decode(files["index.html"]);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /data-activity="notes"/);
  assert.match(html, /data-id/);
});
