import type { ReaderPackage } from "@theoria/mcf-browser";

export type ReaderCourse = Extract<ReaderPackage, { kind: "course" }>;
export type ReaderModule = Extract<ReaderPackage, { kind: "module" }>;
export type ReaderLessonPackage = Extract<ReaderPackage, { kind: "lesson" }>;
export type ReaderLesson = ReaderCourse["chapters"][number]["lessons"][number];
export type ReaderActivity = ReaderLesson["activities"][number];
export type ReaderQuestion = ReaderActivity["questions"][number];
export type ReaderChapter = ReaderCourse["chapters"][number];

export interface ReaderStructure {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  readonly mcf: "1.0" | "1.1";
  readonly kind: "course" | "module" | "lesson";
  readonly language: string;
  readonly chapters: readonly ReaderChapter[];
  readonly rubrics: ReaderCourse["rubrics"];
  readonly assets: ReaderCourse["assets"];
  readonly root: string;
}

export function toReaderStructure(
  value: ReaderPackage,
): ReaderStructure | undefined {
  if (value.kind === "course") {
    return {
      id: value.id,
      title: value.title,
      version: value.version ?? "0.0.0",
      mcf: value.mcf,
      kind: value.sourceKind ?? "course",
      language: value.language,
      chapters: value.chapters,
      rubrics: value.rubrics,
      assets: value.assets,
      root: value.root,
    };
  }
  if (value.kind === "module") {
    return {
      id: value.id,
      title: value.title,
      version: value.version ?? "0.0.0",
      mcf: value.mcf,
      kind: "module",
      language: value.language,
      chapters: [
        {
          id: "module",
          title: value.title,
          source: "",
          lessons: value.lessons,
        },
      ],
      rubrics: value.rubrics,
      assets: value.assets,
      root: value.root,
    };
  }
  if (value.kind === "lesson") {
    return {
      id: value.id,
      title: value.title,
      version: value.version ?? "0.0.0",
      mcf: value.mcf,
      kind: "lesson",
      language: value.language,
      chapters: [
        {
          id: "lesson",
          title: value.title,
          source: "",
          lessons: [value.lesson],
        },
      ],
      rubrics: value.rubrics,
      assets: value.assets,
      root: value.root,
    };
  }
  return undefined;
}

export const lessonsOf = (value: ReaderStructure): readonly ReaderLesson[] =>
  value.chapters.flatMap((chapter) => chapter.lessons);

export const activityKey = (lessonId: string, activityId: string): string =>
  `${lessonId}:${activityId}`;

export const questionKey = (
  lessonId: string,
  activityId: string,
  questionId: string,
): string => `${lessonId}:${activityId}:${questionId}`;
