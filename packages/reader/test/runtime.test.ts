import assert from "node:assert/strict";
import test from "node:test";
import { packageId } from "@theoria/package-model";
import {
  activityKey,
  checkQuestion,
  compatibleProgress,
  coursePercent,
  createProgress,
  earnedPoints,
  evaluateQuestion,
  markActivityViewed,
  prepareActivity,
  questionKey,
  recordResponse,
  refreshAllCompletion,
  submitAssessment,
  type ReaderActivity,
  type ReaderQuestion,
  type ReaderStructure,
} from "../src/index";

const question = (
  patch: Partial<ReaderQuestion> & Pick<ReaderQuestion, "id" | "type">,
): ReaderQuestion =>
  ({
    prompt: patch.id,
    points: 1,
    required: true,
    ...patch,
  }) as ReaderQuestion;

const choice = question({
  id: "choice",
  type: "multiple_choice",
  answer: "b",
  points: 4,
  options: [
    { id: "a", text: "A", weight: 0.5 },
    { id: "b", text: "B", weight: 1 },
  ],
});
const select = question({
  id: "select",
  type: "multiple_select",
  answer: ["a", "b"],
  points: 6,
  scoring: "partial",
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
    { id: "d", text: "D" },
  ],
});
const matching = question({
  id: "matching",
  type: "matching",
  answer: { p1: "r1", p2: "r2" },
  scoring: "partial",
  points: 2,
  premises: [
    { id: "p1", text: "One" },
    { id: "p2", text: "Two" },
  ],
  responses: [
    { id: "r1", text: "First" },
    { id: "r2", text: "Second" },
    { id: "r3", text: "Third" },
  ],
});
const ordering = question({
  id: "ordering",
  type: "ordering",
  answer: ["i1", "i2", "i3"],
  scoring: "partial",
  points: 3,
  items: [
    { id: "i1", text: "One" },
    { id: "i2", text: "Two" },
    { id: "i3", text: "Three" },
  ],
});
const short = question({
  id: "short",
  type: "short_answer",
  answers: ["Café au lait", "coffee with milk"],
  normalization: {
    trim: true,
    case_sensitive: false,
    collapse_whitespace: true,
    unicode: "NFC",
  },
});
const numeric = question({
  id: "numeric",
  type: "numeric",
  answer: 100,
  tolerance: { relative: 0.02 },
  unit: "kg",
});

test("scores weighted, partial, normalized, numeric, matching, and ordering answers", () => {
  assert.equal(earnedPoints(choice, "a"), 2);
  assert.equal(earnedPoints(select, ["a"]), 3);
  assert.equal(earnedPoints(select, ["a", "c"]), 0);
  assert.equal(earnedPoints(matching, { p1: "r1", p2: "r3" }), 1);
  assert.equal(earnedPoints(ordering, ["i1", "i3", "i2"]), 1);
  assert.equal(evaluateQuestion(short, "  CAFE\u0301   AU LAIT "), true);
  assert.equal(evaluateQuestion(numeric, "101.9"), true);
  assert.equal(evaluateQuestion(numeric, "103"), false);
});

const activity: ReaderActivity = {
  id: "assessment",
  type: "assessment",
  title: "Check",
  content: "",
  evaluation: "automatic",
  passing_score: 0.75,
  randomize: true,
  question_pool_size: 3,
  questions: [
    choice,
    select,
    matching,
    ordering,
    question({
      id: "manual",
      type: "essay",
      evaluation: "manual",
      minimum_words: 2,
    }),
  ],
} as ReaderActivity;

const course: ReaderStructure = {
  id: "course",
  title: "Course",
  version: "1.0.0",
  mcf: "1.1",
  kind: "course",
  language: "en",
  root: "",
  assets: [],
  rubrics: [],
  chapters: [
    {
      id: "chapter",
      title: "Chapter",
      source: "chapter.mcf",
      lessons: [
        {
          id: "lesson",
          title: "Lesson",
          source: "lesson.mcf",
          activities: [activity],
          completion: {
            all: [
              {
                activity: "assessment",
                requirement: "passed",
                minimum_score: 0.75,
              },
            ],
          },
        },
      ],
    },
  ],
};

test("persists deterministic pools and order state across resume", () => {
  const initial = createProgress(packageId("local"), "checksum", course);
  const first = prepareActivity(initial, "lesson", activity).state;
  const resumed = prepareActivity(first, "lesson", activity).state;
  const key = activityKey("lesson", activity.id);
  assert.equal(first.questionOrders[key]?.length, 3);
  assert.deepEqual(resumed.questionOrders, first.questionOrders);
  assert.deepEqual(resumed.matchingOrders, first.matchingOrders);
  assert.deepEqual(resumed.orderingOrders, first.orderingOrders);
  assert.equal(
    compatibleProgress(first, packageId("local"), "checksum", course),
    first,
  );
});

test("resumes responses and attempts without treating failed assessments as complete", () => {
  let state = createProgress(packageId("local"), "checksum", course);
  const selected = prepareActivity(state, "lesson", activity);
  state = selected.state;
  for (const item of selected.questions) {
    const response =
      item.type === "multiple_choice"
        ? "a"
        : item.type === "multiple_select"
          ? ["a"]
          : item.type === "matching"
            ? { p1: "r1", p2: "r1" }
            : item.type === "ordering"
              ? ["i1", "i3", "i2"]
              : "two words";
    state = recordResponse(state, "lesson", activity, item, response);
  }
  const submitted = submitAssessment(state, "lesson", activity);
  assert.equal(submitted.outcome.status, "submitted");
  if (submitted.outcome.status === "submitted") {
    assert.notEqual(submitted.outcome.assessment.passed, true);
  }
  assert.notEqual(submitted.state.lessons.lesson, true);
  const anyQuestion = selected.questions[0]!;
  const checked = checkQuestion(
    state,
    "lesson",
    { ...activity, type: "practice" } as ReaderActivity,
    anyQuestion,
  ).state;
  assert.equal(
    checked.questions[questionKey("lesson", activity.id, anyQuestion.id)]
      ?.attempts,
    1,
  );
});

test("nested viewed completion and course percentage derive from authored rules", () => {
  const notes = {
    id: "notes",
    type: "notes",
    content: "Read",
    questions: [],
  } as unknown as ReaderActivity;
  const nested = {
    ...course,
    chapters: [
      {
        ...course.chapters[0]!,
        lessons: [
          {
            ...course.chapters[0]!.lessons[0]!,
            activities: [notes],
            completion: {
              all: [
                {
                  any: [
                    { activity: "notes", requirement: "viewed" as const },
                    {
                      activity: "notes",
                      requirement: "manually_marked_complete" as const,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  } as ReaderStructure;
  let state = createProgress(packageId("local"), "nested", nested);
  assert.equal(coursePercent(nested, state), 0);
  state = markActivityViewed(state, "lesson", notes);
  state = refreshAllCompletion(nested, state);
  assert.equal(state.lessons.lesson, true);
  assert.equal(coursePercent(nested, state), 100);
});
