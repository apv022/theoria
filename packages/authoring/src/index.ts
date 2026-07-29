import type {
  EngineResult,
  PackageInput,
  ReaderPackage,
  SerializedFile,
} from "@theoria/mcf-browser";
import {
  draftId,
  packageId,
  type DraftSourceFile,
  type McfVersion,
  type PackageDraft,
  type PackageKind,
  type ValidationSummary,
} from "@theoria/package-model";
import { stringify } from "yaml";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const textPattern = /\.(?:ya?ml|mcf|md|markdown|txt|json|csv|vtt)$/i;

const cloneBuffer = (value: ArrayBuffer): ArrayBuffer => value.slice(0);

export const isTextPath = (path: string): boolean => textPattern.test(path);

export const toDraftFile = (file: SerializedFile): DraftSourceFile => ({
  path: file.path,
  kind: isTextPath(file.path) ? "text" : "binary",
  bytes: cloneBuffer(file.bytes),
});

export const draftInput = (draft: PackageDraft): PackageInput => ({
  type: "directory",
  name: draft.title,
  files: draft.sourceFiles.map((file) => ({
    path: file.path,
    bytes: cloneBuffer(file.bytes),
  })),
});

export const fileText = (file: DraftSourceFile): string =>
  decoder.decode(file.bytes);

const clean = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        item !== undefined &&
        item !== "" &&
        item !== null &&
        (!Array.isArray(item) || item.length > 0),
    ),
  );

const yaml = (value: Record<string, unknown>): string =>
  stringify(clean(value), { lineWidth: 100 }).trimEnd();

const without = (
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );

const dirname = (path: string): string =>
  path.split("/").slice(0, -1).join("/");

const relative = (from: string, target: string): string => {
  const left = dirname(from).split("/").filter(Boolean);
  const right = target.split("/").filter(Boolean);
  while (left[0] && left[0] === right[0]) {
    left.shift();
    right.shift();
  }
  return [...left.map(() => ".."), ...right].join("/");
};

const lessonSource = (
  lesson: Record<string, unknown> & {
    activities: readonly Record<string, unknown>[];
  },
): string => {
  const front = without(lesson, ["activities", "source"]);
  const activities = lesson.activities.map((activity) => {
    const questions = (activity.questions ?? []) as readonly Record<
      string,
      unknown
    >[];
    const metadata = without(activity, [
      "content",
      "questions",
      "question_references",
    ]);
    const questionSource = questions
      .map(
        (question) =>
          `\n\n\`\`\`mcf-question\n${yaml(
            without(question, ["source_reference"]),
          )}\n\`\`\``,
      )
      .join("");
    return `:::mcf-activity\n${yaml(metadata)}\n:::\n\n${String(
      activity.content ?? "",
    ).trimEnd()}${questionSource}\n\n:::mcf-end`;
  });
  return `---\n${yaml(front)}\n---\n\n${activities.join("\n\n")}\n`;
};

const packageMetadata = (pkg: ReaderPackage): Record<string, unknown> => {
  const metadata = without(pkg as unknown as Record<string, unknown>, [
    "diagnostics",
    "sourceType",
    "sourceKind",
    "root",
    "chapters",
    "lessons",
    "lesson",
    "entry",
  ]);
  if (pkg.mcf === "1.0") delete metadata.kind;
  return metadata;
};

export function generatedFiles(pkg: ReaderPackage): readonly DraftSourceFile[] {
  const files = new Map<string, string>();
  if (pkg.kind === "course") {
    const manifest = {
      ...packageMetadata(pkg),
      chapters: pkg.chapters.map((chapter) => ({
        source: chapter.source.endsWith("/chapter.yaml")
          ? dirname(chapter.source)
          : chapter.source,
      })),
    };
    files.set("manifest.yaml", `${yaml(manifest)}\n`);
    for (const chapter of pkg.chapters) {
      const chapterPath = chapter.source.endsWith(".yaml")
        ? chapter.source
        : `${chapter.source}/chapter.yaml`;
      files.set(
        chapterPath,
        `${yaml({
          ...without(chapter as unknown as Record<string, unknown>, [
            "lessons",
            "source",
          ]),
          lessons: chapter.lessons.map((lesson) =>
            relative(chapterPath, lesson.source),
          ),
        })}\n`,
      );
      for (const lesson of chapter.lessons)
        files.set(
          lesson.source,
          lessonSource(
            lesson as unknown as Record<string, unknown> & {
              activities: readonly Record<string, unknown>[];
            },
          ),
        );
    }
  } else if (pkg.kind === "module") {
    files.set(
      "manifest.yaml",
      `${yaml({
        ...packageMetadata(pkg),
        lessons: pkg.lessons.map((lesson) => ({ source: lesson.source })),
      })}\n`,
    );
    for (const lesson of pkg.lessons)
      files.set(
        lesson.source,
        lessonSource(
          lesson as unknown as Record<string, unknown> & {
            activities: readonly Record<string, unknown>[];
          },
        ),
      );
  } else if (pkg.kind === "lesson") {
    files.set(
      "manifest.yaml",
      `${yaml({ ...packageMetadata(pkg), entry: pkg.entry })}\n`,
    );
    files.set(
      pkg.entry,
      lessonSource(
        pkg.lesson as unknown as Record<string, unknown> & {
          activities: readonly Record<string, unknown>[];
        },
      ),
    );
  } else {
    throw new Error(
      `${pkg.kind} packages are preserved in Source mode; visual regeneration is not supported.`,
    );
  }
  return [...files].map(([path, source]) => ({
    path,
    kind: "text" as const,
    bytes: encoder.encode(source).buffer as ArrayBuffer,
  }));
}

const hasSourceOnlyConstructs = (pkg: ReaderPackage): boolean => {
  if (pkg.kind === "question_bank" || pkg.kind === "asset_collection")
    return true;
  const lessons =
    pkg.kind === "course"
      ? pkg.chapters.flatMap((chapter) => chapter.lessons)
      : pkg.kind === "module"
        ? pkg.lessons
        : [pkg.lesson];
  return lessons.some((lesson) =>
    lesson.activities.some(
      (activity) =>
        Boolean(activity.question_references?.length) ||
        activity.questions.some((question) =>
          Boolean(question.source_reference),
        ),
    ),
  );
};

const timestamp = (): string => new Date().toISOString();

const editorDefaults = {
  section: "content" as const,
  previewSize: "desktop" as const,
};

function recordCommand(
  draft: PackageDraft,
  label: string,
): PackageDraft["commands"] {
  const revision = draft.revision + 1;
  return [
    ...draft.commands.slice(-49),
    { id: crypto.randomUUID(), label, at: timestamp(), revision },
  ];
}

export function draftFromResult(
  result: Extract<EngineResult, { status: "ok" }>,
  options: {
    readonly id?: string;
    readonly filename?: string;
    readonly imported?: boolean;
  } = {},
): PackageDraft {
  const at = timestamp();
  const sourceFiles = result.sourceFiles.map(toDraftFile);
  return {
    schema: 1,
    id: draftId(options.id ?? crypto.randomUUID()),
    title: result.summary.manifest.title,
    kind: result.summary.manifest.kind,
    mcf: result.summary.manifest.mcf,
    createdAt: at,
    updatedAt: at,
    revision: 0,
    sourceFiles,
    normalizedPackage: structuredClone(result.readerPackage),
    sourceMode: options.imported ? "imported-preserved" : "generated",
    visualEditing: hasSourceOnlyConstructs(result.readerPackage)
      ? "source-only"
      : options.imported
        ? "requires-regeneration"
        : "supported",
    ...(options.imported
      ? {
          originalSourceArchive: new Blob([result.sourceArchive], {
            type: "application/zip",
          }),
        }
      : {}),
    ...(options.filename ? { originalFilename: options.filename } : {}),
    sourceChecksum: result.summary.sourceChecksum,
    editor: editorDefaults,
    commands: [],
    validation: result.validation,
  };
}

export function newPackageFiles(
  kind: Extract<PackageKind, "course" | "module" | "lesson">,
  title: string,
  id: string,
): readonly DraftSourceFile[] {
  const lesson = {
    id: "welcome",
    title: "Welcome",
    description: "Introduce this package.",
    source:
      kind === "course"
        ? "chapters/introduction/lessons/welcome.mcf"
        : kind === "module"
          ? "lessons/welcome.mcf"
          : "lesson.mcf",
    activities: [
      {
        id: "welcome-notes",
        type: "notes",
        title: "Introduction",
        content: "# Welcome\n\nStart writing here.",
        questions: [],
      },
    ],
  };
  const base = {
    mcf: "1.1" as const,
    kind,
    id,
    title,
    language: "en",
    version: "0.1.0",
    description: "Created locally in Theoria.",
    authors: ["Package author"],
    license: "CC-BY-4.0",
    assets: [],
    rubrics: [],
    diagnostics: [],
    sourceType: "directory" as const,
    root: "",
  };
  const pkg =
    kind === "course"
      ? ({
          ...base,
          kind,
          chapters: [
            {
              id: "introduction",
              title: "Introduction",
              source: "chapters/introduction/chapter.yaml",
              lessons: [lesson],
            },
          ],
        } as ReaderPackage)
      : kind === "module"
        ? ({ ...base, kind, lessons: [lesson] } as ReaderPackage)
        : ({
            ...base,
            kind,
            entry: "lesson.mcf",
            lesson,
          } as ReaderPackage);
  return generatedFiles(pkg);
}

export function updateSourceText(
  draft: PackageDraft,
  path: string,
  source: string,
): PackageDraft {
  const sourceFiles = draft.sourceFiles.map((file) =>
    file.path === path
      ? {
          ...file,
          kind: "text" as const,
          bytes: encoder.encode(source).buffer as ArrayBuffer,
        }
      : file,
  );
  if (!sourceFiles.some((file) => file.path === path)) {
    sourceFiles.push({
      path,
      kind: "text",
      bytes: encoder.encode(source).buffer as ArrayBuffer,
    });
  }
  return {
    ...draft,
    sourceFiles,
    sourceMode: "source-edited",
    visualEditing: "requires-regeneration",
    validation: { state: "unchecked", diagnostics: [] },
    revision: draft.revision + 1,
    updatedAt: timestamp(),
    commands: recordCommand(draft, `Edit ${path}`),
  };
}

export function regenerateFromPackage(
  draft: PackageDraft,
  pkg: ReaderPackage,
  label: string,
): PackageDraft {
  if (hasSourceOnlyConstructs(pkg))
    throw new Error(
      "This package contains source references that cannot be regenerated visually.",
    );
  const generated = generatedFiles(pkg);
  const generatedPaths = new Set(generated.map((file) => file.path));
  const retained = draft.sourceFiles.filter(
    (file) =>
      !generatedPaths.has(file.path) &&
      file.path !== "manifest.yaml" &&
      !file.path.endsWith(".mcf") &&
      !file.path.endsWith("/chapter.yaml"),
  );
  return {
    ...draft,
    title: pkg.title,
    kind: pkg.kind,
    mcf: pkg.mcf,
    sourceFiles: [...generated, ...retained].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    normalizedPackage: structuredClone(pkg),
    sourceMode: "generated",
    visualEditing: "supported",
    validation: { state: "unchecked", diagnostics: [] },
    revision: draft.revision + 1,
    updatedAt: timestamp(),
    commands: recordCommand(draft, label),
  };
}

export function acceptValidation(
  draft: PackageDraft,
  result: Extract<EngineResult, { status: "ok" }>,
): PackageDraft {
  return {
    ...draft,
    title: result.summary.manifest.title,
    kind: result.summary.manifest.kind,
    mcf: result.summary.manifest.mcf,
    sourceFiles: result.sourceFiles.map(toDraftFile),
    normalizedPackage: structuredClone(result.readerPackage),
    sourceChecksum: result.summary.sourceChecksum,
    visualEditing: hasSourceOnlyConstructs(result.readerPackage)
      ? "source-only"
      : draft.sourceMode === "imported-preserved"
        ? "requires-regeneration"
        : "supported",
    validation: result.validation,
    updatedAt: timestamp(),
  };
}

export function withValidation(
  draft: PackageDraft,
  validation: ValidationSummary,
): PackageDraft {
  return { ...draft, validation, updatedAt: timestamp() };
}

export function migrateDraft(value: unknown): PackageDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<PackageDraft>;
  if (
    candidate.schema === 1 &&
    Array.isArray(candidate.sourceFiles) &&
    candidate.sourceFiles.every(
      (file) =>
        typeof file === "object" &&
        file !== null &&
        "path" in file &&
        "bytes" in file,
    )
  )
    return candidate as PackageDraft;
  return undefined;
}

export function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .replace(/^[^a-z]+/, "") || "package"
  );
}

export function uniqueId(base: string, existing: readonly string[]): string {
  const stem = slug(base);
  let value = stem;
  let suffix = 2;
  while (existing.includes(value)) value = `${stem}-${suffix++}`;
  return value;
}

export function packageIdentityOf(draft: PackageDraft): {
  readonly id: ReturnType<typeof packageId>;
  readonly version: string;
} {
  const pkg = draft.normalizedPackage as ReaderPackage | undefined;
  return {
    id: packageId(pkg?.id ?? slug(draft.title)),
    version: pkg?.version ?? "0.0.0",
  };
}

export type AuthoringPackage = ReaderPackage;
export type AuthoringMcfVersion = McfVersion;

export type AuthoringLesson = Extract<
  ReaderPackage,
  { kind: "course" }
>["chapters"][number]["lessons"][number];
export type AuthoringChapter = Extract<
  ReaderPackage,
  { kind: "course" }
>["chapters"][number];
export type AuthoringActivity = AuthoringLesson["activities"][number];
export type AuthoringQuestion = AuthoringActivity["questions"][number];
export type AuthoringQuestionType = AuthoringQuestion["type"];

export const authoringLessons = (
  pkg: ReaderPackage,
): readonly AuthoringLesson[] =>
  pkg.kind === "course"
    ? pkg.chapters.flatMap((chapter) => chapter.lessons)
    : pkg.kind === "module"
      ? pkg.lessons
      : pkg.kind === "lesson"
        ? [pkg.lesson]
        : [];

export function updatePackageMetadata(
  pkg: ReaderPackage,
  patch: Readonly<Record<string, unknown>>,
): ReaderPackage {
  return Object.assign(structuredClone(pkg), patch) as ReaderPackage;
}

export function updateLesson(
  pkg: ReaderPackage,
  lessonId: string,
  update: (lesson: AuthoringLesson) => AuthoringLesson,
): ReaderPackage {
  const next = structuredClone(pkg);
  if (next.kind === "course") {
    for (const chapter of next.chapters) {
      const index = chapter.lessons.findIndex((item) => item.id === lessonId);
      if (index >= 0) chapter.lessons[index] = update(chapter.lessons[index]!);
    }
  } else if (next.kind === "module") {
    const index = next.lessons.findIndex((item) => item.id === lessonId);
    if (index >= 0) next.lessons[index] = update(next.lessons[index]!);
  } else if (next.kind === "lesson" && next.lesson.id === lessonId) {
    next.lesson = update(next.lesson);
  }
  return next;
}

export function updateChapter(
  pkg: ReaderPackage,
  chapterId: string,
  update: (chapter: AuthoringChapter) => AuthoringChapter,
): ReaderPackage {
  if (pkg.kind !== "course") return pkg;
  const next = structuredClone(pkg);
  next.chapters = next.chapters.map((chapter) =>
    chapter.id === chapterId ? update(chapter) : chapter,
  );
  return next;
}

export function addChapter(
  pkg: ReaderPackage,
  title = "New chapter",
): { readonly package: ReaderPackage; readonly chapterId: string } {
  if (pkg.kind !== "course")
    throw new Error("Only course packages contain chapters.");
  const next = structuredClone(pkg);
  const id = uniqueId(
    title,
    next.chapters.map((chapter) => chapter.id),
  );
  next.chapters.push({
    id,
    title,
    description: "",
    source: `chapters/${id}/chapter.yaml`,
    lessons: [],
  });
  return { package: next, chapterId: id };
}

export function duplicateChapter(
  pkg: ReaderPackage,
  chapterId: string,
): { readonly package: ReaderPackage; readonly chapterId: string } {
  if (pkg.kind !== "course")
    throw new Error("Only course packages contain chapters.");
  const next = structuredClone(pkg);
  const source = next.chapters.find((chapter) => chapter.id === chapterId);
  if (!source) throw new Error("The selected chapter no longer exists.");
  const id = uniqueId(
    `${source.id}-copy`,
    next.chapters.map((chapter) => chapter.id),
  );
  const copy = structuredClone(source);
  copy.id = id;
  copy.title = `${source.title} copy`;
  copy.source = `chapters/${id}/chapter.yaml`;
  copy.lessons = copy.lessons.map((lesson) => {
    const lessonId = uniqueId(
      lesson.id,
      next.chapters.flatMap((chapter) =>
        chapter.lessons.map((item) => item.id),
      ),
    );
    return {
      ...lesson,
      id: lessonId,
      source: `chapters/${id}/lessons/${lessonId}.mcf`,
    };
  });
  next.chapters.push(copy);
  return { package: next, chapterId: id };
}

export function removeChapter(
  pkg: ReaderPackage,
  chapterId: string,
): ReaderPackage {
  if (pkg.kind !== "course")
    throw new Error("Only course packages contain chapters.");
  if (pkg.chapters.length <= 1)
    throw new Error("A course must retain at least one chapter.");
  const next = structuredClone(pkg);
  next.chapters = next.chapters.filter((chapter) => chapter.id !== chapterId);
  return next;
}

export function moveChapter(
  pkg: ReaderPackage,
  chapterId: string,
  direction: -1 | 1,
): ReaderPackage {
  if (pkg.kind !== "course") return pkg;
  const next = structuredClone(pkg);
  const index = next.chapters.findIndex((chapter) => chapter.id === chapterId);
  const target = index + direction;
  if (index >= 0 && target >= 0 && target < next.chapters.length)
    [next.chapters[index], next.chapters[target]] = [
      next.chapters[target]!,
      next.chapters[index]!,
    ];
  return next;
}

export function addLesson(
  pkg: ReaderPackage,
  title = "New lesson",
  chapterId?: string,
): { readonly package: ReaderPackage; readonly lessonId: string } {
  if (pkg.kind !== "course" && pkg.kind !== "module")
    throw new Error("A standalone lesson package contains exactly one lesson.");
  const next = structuredClone(pkg);
  const lessons = authoringLessons(next);
  const id = uniqueId(
    title,
    lessons.map((item) => item.id),
  );
  const chapterSource =
    next.kind === "course"
      ? (next.chapters.find((chapter) => chapter.id === chapterId)?.source ??
        next.chapters.find((chapter) => chapter.lessons.length === 0)?.source ??
        next.chapters[0]?.source ??
        "chapters/content")
      : "";
  const root = chapterSource.endsWith(".yaml")
    ? dirname(chapterSource)
    : chapterSource;
  const lesson = {
    id,
    title,
    description: "",
    source:
      next.kind === "course"
        ? `${root}/lessons/${id}.mcf`
        : `lessons/${id}.mcf`,
    activities: [
      {
        id: `${id}-notes`,
        type: "notes" as const,
        title: "Notes",
        content: "# New lesson\n\nStart writing here.",
        questions: [],
      },
    ],
  } as AuthoringLesson;
  if (next.kind === "course") {
    const chapter =
      next.chapters.find((item) => item.id === chapterId) ??
      next.chapters.find((item) => item.lessons.length === 0) ??
      next.chapters[0];
    if (!chapter) throw new Error("Add a chapter before adding lessons.");
    chapter.lessons.push(lesson);
  } else next.lessons.push(lesson);
  return { package: next, lessonId: id };
}

export function duplicateLesson(
  pkg: ReaderPackage,
  lessonId: string,
): { readonly package: ReaderPackage; readonly lessonId: string } {
  const source = authoringLessons(pkg).find((item) => item.id === lessonId);
  if (!source) throw new Error("The selected lesson no longer exists.");
  const added = addLesson(pkg, `${source.title} copy`);
  const replacement = {
    ...structuredClone(source),
    id: added.lessonId,
    title: `${source.title} copy`,
    source: authoringLessons(added.package).find(
      (item) => item.id === added.lessonId,
    )!.source,
  };
  return {
    package: updateLesson(added.package, added.lessonId, () => replacement),
    lessonId: added.lessonId,
  };
}

export function removeLesson(
  pkg: ReaderPackage,
  lessonId: string,
): ReaderPackage {
  const next = structuredClone(pkg);
  if (next.kind === "course") {
    const total = authoringLessons(next).length;
    if (total <= 1)
      throw new Error("A course must retain at least one lesson.");
    for (const chapter of next.chapters)
      chapter.lessons = chapter.lessons.filter((item) => item.id !== lessonId);
  } else if (next.kind === "module") {
    if (next.lessons.length <= 1)
      throw new Error("A module must retain at least one lesson.");
    next.lessons = next.lessons.filter((item) => item.id !== lessonId);
  } else throw new Error("A standalone lesson cannot be deleted.");
  return next;
}

export function moveLesson(
  pkg: ReaderPackage,
  lessonId: string,
  direction: -1 | 1,
): ReaderPackage {
  const next = structuredClone(pkg);
  const move = (items: AuthoringLesson[]) => {
    const index = items.findIndex((item) => item.id === lessonId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target]!, items[index]!];
  };
  if (next.kind === "course") {
    for (const chapter of next.chapters) move(chapter.lessons);
  } else if (next.kind === "module") move(next.lessons);
  return next;
}

export function updateActivity(
  pkg: ReaderPackage,
  lessonId: string,
  activityId: string,
  update: (activity: AuthoringActivity) => AuthoringActivity,
): ReaderPackage {
  return updateLesson(pkg, lessonId, (lesson) => ({
    ...lesson,
    activities: lesson.activities.map((activity) =>
      activity.id === activityId ? update(activity) : activity,
    ),
  }));
}

export function addActivity(
  pkg: ReaderPackage,
  lessonId: string,
  type: AuthoringActivity["type"],
): { readonly package: ReaderPackage; readonly activityId: string } {
  const lesson = authoringLessons(pkg).find((item) => item.id === lessonId);
  if (!lesson) throw new Error("Select a lesson first.");
  const id = uniqueId(
    `${type}-activity`,
    lesson.activities.map((item) => item.id),
  );
  const activity = {
    id,
    type,
    title: type === "notes" ? "Notes" : "New activity",
    content: type === "notes" ? "# Notes\n\nStart writing here." : "",
    questions: [],
    ...(type === "assessment" ? { passing_score: 0.7 } : {}),
    ...(type === "assignment"
      ? {
          evaluation: "manual" as const,
          submission: { modes: ["text" as const] },
        }
      : {}),
  } as AuthoringActivity;
  return {
    package: updateLesson(pkg, lessonId, (value) => ({
      ...value,
      activities: [...value.activities, activity],
    })),
    activityId: id,
  };
}

export function removeActivity(
  pkg: ReaderPackage,
  lessonId: string,
  activityId: string,
): ReaderPackage {
  return updateLesson(pkg, lessonId, (lesson) => {
    if (lesson.activities.length <= 1)
      throw new Error("A lesson must retain at least one activity.");
    return {
      ...lesson,
      activities: lesson.activities.filter((item) => item.id !== activityId),
    };
  });
}

export function duplicateActivity(
  pkg: ReaderPackage,
  lessonId: string,
  activityId: string,
): { readonly package: ReaderPackage; readonly activityId: string } {
  const lesson = authoringLessons(pkg).find((item) => item.id === lessonId);
  const activity = lesson?.activities.find((item) => item.id === activityId);
  if (!activity) throw new Error("The selected activity no longer exists.");
  const id = uniqueId(
    `${activity.id}-copy`,
    lesson!.activities.map((item) => item.id),
  );
  const copy = {
    ...structuredClone(activity),
    id,
    title: `${activity.title ?? activity.type} copy`,
  };
  return {
    package: updateLesson(pkg, lessonId, (value) => ({
      ...value,
      activities: [...value.activities, copy],
    })),
    activityId: id,
  };
}

export function moveActivity(
  pkg: ReaderPackage,
  lessonId: string,
  activityId: string,
  direction: -1 | 1,
): ReaderPackage {
  return updateLesson(pkg, lessonId, (lesson) => {
    const activities = [...lesson.activities];
    const index = activities.findIndex((item) => item.id === activityId);
    const target = index + direction;
    if (index >= 0 && target >= 0 && target < activities.length)
      [activities[index], activities[target]] = [
        activities[target]!,
        activities[index]!,
      ];
    return { ...lesson, activities };
  });
}

export function newQuestion(
  type: AuthoringQuestionType,
  existing: readonly string[],
): AuthoringQuestion {
  const id = uniqueId(`${type}-question`, existing);
  const common = {
    id,
    type,
    prompt: "Write the question prompt.",
    points: 1,
    required: true,
  };
  if (type === "multiple_choice" || type === "multiple_select")
    return {
      ...common,
      options: [
        { id: "a", text: "First option" },
        { id: "b", text: "Second option" },
      ],
      answer: type === "multiple_select" ? ["a"] : "a",
      ...(type === "multiple_select" ? { scoring: "partial" as const } : {}),
    } as AuthoringQuestion;
  if (type === "true_false")
    return { ...common, answer: true } as AuthoringQuestion;
  if (type === "numeric")
    return {
      ...common,
      answer: 0,
      tolerance: { absolute: 0 },
      unit: "",
    } as AuthoringQuestion;
  if (type === "short_answer")
    return {
      ...common,
      answers: ["answer"],
      normalization: {
        trim: true,
        case_sensitive: false,
        unicode: "NFC" as const,
      },
    } as AuthoringQuestion;
  if (type === "matching")
    return {
      ...common,
      premises: [
        { id: "left-a", text: "First premise" },
        { id: "left-b", text: "Second premise" },
      ],
      responses: [
        { id: "right-a", text: "First response" },
        { id: "right-b", text: "Second response" },
      ],
      answer: { "left-a": "right-a", "left-b": "right-b" },
      scoring: "partial",
      reuse_responses: false,
    } as AuthoringQuestion;
  if (type === "ordering")
    return {
      ...common,
      items: [
        { id: "first", text: "First" },
        { id: "second", text: "Second" },
      ],
      answer: ["first", "second"],
      scoring: "partial",
    } as AuthoringQuestion;
  return {
    ...common,
    evaluation: type === "essay" ? "manual" : "completion",
    minimum_words: 20,
  } as AuthoringQuestion;
}

export function updateQuestion(
  pkg: ReaderPackage,
  lessonId: string,
  activityId: string,
  questionId: string,
  update: (question: AuthoringQuestion) => AuthoringQuestion,
): ReaderPackage {
  return updateActivity(pkg, lessonId, activityId, (activity) => ({
    ...activity,
    questions: activity.questions.map((question) =>
      question.id === questionId ? update(question) : question,
    ),
  }));
}

export function addQuestion(
  pkg: ReaderPackage,
  lessonId: string,
  activityId: string,
  type: AuthoringQuestionType,
): { readonly package: ReaderPackage; readonly questionId: string } {
  const lesson = authoringLessons(pkg).find((item) => item.id === lessonId);
  const activity = lesson?.activities.find((item) => item.id === activityId);
  if (!activity) throw new Error("Select an activity first.");
  const question = newQuestion(
    type,
    activity.questions.map((item) => item.id),
  );
  return {
    package: updateActivity(pkg, lessonId, activityId, (value) => ({
      ...value,
      questions: [...value.questions, question],
    })),
    questionId: question.id,
  };
}

export function removeQuestion(
  pkg: ReaderPackage,
  lessonId: string,
  activityId: string,
  questionId: string,
): ReaderPackage {
  return updateActivity(pkg, lessonId, activityId, (activity) => ({
    ...activity,
    questions: activity.questions.filter((item) => item.id !== questionId),
  }));
}

export function duplicateQuestion(
  pkg: ReaderPackage,
  lessonId: string,
  activityId: string,
  questionId: string,
): { readonly package: ReaderPackage; readonly questionId: string } {
  const lesson = authoringLessons(pkg).find((item) => item.id === lessonId);
  const activity = lesson?.activities.find((item) => item.id === activityId);
  const question = activity?.questions.find((item) => item.id === questionId);
  if (!question) throw new Error("The selected question no longer exists.");
  const id = uniqueId(
    `${question.id}-copy`,
    activity!.questions.map((item) => item.id),
  );
  const copy = { ...structuredClone(question), id };
  return {
    package: updateActivity(pkg, lessonId, activityId, (value) => ({
      ...value,
      questions: [...value.questions, copy],
    })),
    questionId: id,
  };
}
