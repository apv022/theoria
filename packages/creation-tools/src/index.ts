import {
  AIProviderError,
  type AIProvider,
  type GenerationResult,
} from "@theoria/ai-provider";
import type { ReaderPackage } from "@theoria/mcf-browser";

export interface FactoryBrief {
  readonly title: string;
  readonly description: string;
  readonly subject: string;
  readonly learner: string;
  readonly alignment: string;
  readonly instructions: string;
  readonly sourceMaterial: string;
}

export interface FactoryCandidate {
  readonly title: string;
  readonly description: string;
  readonly chapters: readonly {
    readonly title: string;
    readonly lessons: readonly {
      readonly title: string;
      readonly description: string;
      readonly sections: readonly {
        readonly title: string;
        readonly content: string;
      }[];
    }[];
  }[];
}

export interface FactoryValidation<T> {
  readonly ok: boolean;
  readonly artifact?: T;
  readonly diagnostics: readonly string[];
}

export interface FactoryGeneration<T> {
  readonly candidate: FactoryCandidate;
  readonly artifact: T;
  readonly attempts: number;
  readonly providerResults: readonly GenerationResult[];
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Candidate field ${field} must be non-empty text.`);
  return value.trim();
};

export function parseFactoryCandidate(output: string): FactoryCandidate {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(output);
  let value: unknown;
  try {
    value = JSON.parse(fenced?.[1] ?? output);
  } catch {
    throw new Error("The provider did not return valid structured JSON.");
  }
  if (!object(value) || !Array.isArray(value.chapters))
    throw new Error("The provider response does not match the course schema.");
  const chapters = value.chapters.map((chapter, chapterIndex) => {
    if (!object(chapter) || !Array.isArray(chapter.lessons))
      throw new Error(`Candidate chapter ${chapterIndex + 1} is malformed.`);
    return {
      title: text(chapter.title, `chapters[${chapterIndex}].title`),
      lessons: chapter.lessons.map((lesson, lessonIndex) => {
        if (!object(lesson) || !Array.isArray(lesson.sections))
          throw new Error(
            `Candidate lesson ${chapterIndex + 1}.${lessonIndex + 1} is malformed.`,
          );
        return {
          title: text(lesson.title, "lesson.title"),
          description:
            typeof lesson.description === "string"
              ? lesson.description.trim()
              : "",
          sections: lesson.sections.map((section, sectionIndex) => {
            if (!object(section))
              throw new Error(
                `Candidate section ${chapterIndex + 1}.${lessonIndex + 1}.${sectionIndex + 1} is malformed.`,
              );
            return {
              title: text(section.title, "section.title"),
              content: text(section.content, "section.content"),
            };
          }),
        };
      }),
    };
  });
  if (!chapters.length || chapters.some((chapter) => !chapter.lessons.length))
    throw new Error("A course needs at least one chapter and lesson.");
  if (
    chapters.some((chapter) =>
      chapter.lessons.some((lesson) => !lesson.sections.length),
    )
  )
    throw new Error("Every lesson needs at least one content section.");
  return {
    title: text(value.title, "title"),
    description:
      typeof value.description === "string" ? value.description.trim() : "",
    chapters,
  };
}

const identifier = (value: string, fallback: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || fallback;

const unique = (base: string, used: Set<string>): string => {
  let value = base;
  let suffix = 2;
  while (used.has(value)) value = `${base}-${suffix++}`;
  used.add(value);
  return value;
};

export function factoryCandidatePackage(
  candidate: FactoryCandidate,
  brief: FactoryBrief,
): ReaderPackage {
  const chapterIds = new Set<string>();
  const lessonIds = new Set<string>();
  const activityIds = new Set<string>();
  return {
    mcf: "1.1",
    kind: "course",
    id: identifier(candidate.title || brief.title, "generated-course"),
    title: candidate.title,
    description: candidate.description || brief.description,
    language: "en",
    version: "0.1.0",
    authors: ["Package author"],
    license: "CC-BY-4.0",
    ...(brief.subject.trim() ? { subjects: [brief.subject.trim()] } : {}),
    ...(brief.learner.trim() ? { level: { label: brief.learner.trim() } } : {}),
    ...(brief.alignment.trim()
      ? { alignment_context: brief.alignment.trim() }
      : {}),
    root: "",
    sourceType: "directory",
    diagnostics: [],
    assets: [],
    rubrics: [],
    chapters: candidate.chapters.map((chapter, chapterIndex) => {
      const chapterId = unique(
        identifier(chapter.title, `chapter-${chapterIndex + 1}`),
        chapterIds,
      );
      return {
        id: chapterId,
        title: chapter.title,
        source: `chapters/${chapterId}/chapter.yaml`,
        lessons: chapter.lessons.map((lesson, lessonIndex) => {
          const lessonId = unique(
            identifier(lesson.title, `lesson-${lessonIndex + 1}`),
            lessonIds,
          );
          return {
            id: lessonId,
            title: lesson.title,
            description: lesson.description,
            source: `chapters/${chapterId}/lessons/${lessonId}.mcf`,
            activities: lesson.sections.map((section, sectionIndex) => ({
              id: unique(
                identifier(section.title, `section-${sectionIndex + 1}`),
                activityIds,
              ),
              type: "notes" as const,
              title: section.title,
              content: section.content,
              questions: [],
            })),
          };
        }),
      };
    }),
  } as ReaderPackage;
}

const schema = `Return only JSON with this exact shape:
{"title":"...","description":"...","chapters":[{"title":"...","lessons":[{"title":"...","description":"...","sections":[{"title":"...","content":"Markdown instructional content"}]}]}]}`;

export function factoryPrompt(brief: FactoryBrief): string {
  return `${schema}

Create a coherent, editable course draft. Do not include claims not supported by the brief or source. Use concise Markdown and no HTML.

Title: ${brief.title}
Description: ${brief.description}
Subject: ${brief.subject}
Intended learner or level: ${brief.learner}
Curriculum or alignment context: ${brief.alignment}

Creator instructions:
${brief.instructions}

Source material:
${brief.sourceMaterial || "No source material supplied."}`;
}

export async function generateFactoryCourse<T>({
  provider,
  modelId,
  brief,
  validate,
  signal,
  maxAttempts = 2,
}: {
  readonly provider: AIProvider;
  readonly modelId: string;
  readonly brief: FactoryBrief;
  readonly validate: (
    candidate: FactoryCandidate,
  ) => Promise<FactoryValidation<T>>;
  readonly signal?: AbortSignal;
  readonly maxAttempts?: number;
}): Promise<FactoryGeneration<T>> {
  const boundedAttempts = Math.max(1, Math.min(2, Math.floor(maxAttempts)));
  const results: GenerationResult[] = [];
  let feedback = "";
  let lastFailure = "The generated draft could not be validated.";
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    const result = await provider.generate({
      modelId,
      ...(signal ? { signal } : {}),
      messages: [
        {
          role: "system",
          content:
            "You produce structured course candidates for deterministic MCF validation. Return JSON only.",
        },
        {
          role: "user",
          content:
            attempt === 1
              ? factoryPrompt(brief)
              : `${factoryPrompt(brief)}\n\nRepair the previous response using these exact failures:\n${feedback}`,
        },
      ],
      maxOutputTokens: 12_000,
    });
    results.push(result);
    let candidate: FactoryCandidate;
    try {
      candidate = parseFactoryCandidate(result.text);
    } catch (reason) {
      lastFailure = reason instanceof Error ? reason.message : lastFailure;
      feedback = lastFailure;
      continue;
    }
    const validation = await validate(candidate);
    if (validation.ok && validation.artifact !== undefined)
      return {
        candidate,
        artifact: validation.artifact,
        attempts: attempt,
        providerResults: results,
      };
    lastFailure = "MCF validation rejected the generated draft.";
    feedback = validation.diagnostics.slice(0, 20).join("\n") || lastFailure;
  }
  throw new AIProviderError(
    "invalid-response",
    `${lastFailure} Automatic repair stopped after ${boundedAttempts} attempts.`,
  );
}

export interface BatchIdentity {
  readonly key: string;
  readonly checksum: string;
  readonly packageId: string;
  readonly version: string;
}

export function duplicateReasons(
  items: readonly BatchIdentity[],
): ReadonlyMap<string, string> {
  const reasons = new Map<string, string>();
  const checksums = new Map<string, string>();
  const versions = new Map<string, string>();
  for (const item of items) {
    const checksumMatch = checksums.get(item.checksum);
    const versionKey = `${item.packageId}@${item.version}`;
    const versionMatch = versions.get(versionKey);
    if (checksumMatch)
      reasons.set(item.key, `Same source checksum as ${checksumMatch}.`);
    else if (versionMatch)
      reasons.set(item.key, `Same package ID and version as ${versionMatch}.`);
    else {
      checksums.set(item.checksum, item.key);
      versions.set(versionKey, item.key);
    }
  }
  return reasons;
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(values.length, Math.max(1, Math.floor(concurrency))) },
    async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await operation(values[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
