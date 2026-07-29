import type { ReaderQuestion } from "./model";

export interface EvaluationResult {
  readonly complete: boolean;
  readonly correct: boolean | null;
  readonly earned: number | null;
  readonly feedback: readonly string[];
}

export function numericResponse(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
    return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function responseComplete(
  question: ReaderQuestion,
  value: unknown,
): boolean {
  switch (question.type) {
    case "multiple_choice":
    case "true_false":
      return typeof value === "string" && value.length > 0;
    case "multiple_select":
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((id) => typeof id === "string") &&
        new Set(value).size === value.length
      );
    case "numeric":
      return numericResponse(value) !== undefined;
    case "short_answer":
    case "essay":
    case "open_response":
      return typeof value === "string" && value.trim().length > 0;
    case "matching": {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
      const actual = value as Record<string, unknown>;
      const ids = (question.premises ?? []).map((item) => item.id);
      const selected = ids.map((id) => actual[id]);
      return (
        ids.length > 0 &&
        selected.every((id) => typeof id === "string" && id.length > 0) &&
        (question.reuse_responses || new Set(selected).size === selected.length)
      );
    }
    case "ordering": {
      if (!Array.isArray(value)) return false;
      const expected = (question.items ?? []).map((item) => item.id);
      return (
        value.length === expected.length &&
        new Set(value).size === value.length &&
        value.every((id) => typeof id === "string" && expected.includes(id))
      );
    }
    default:
      return (
        value !== null && value !== undefined && String(value).trim().length > 0
      );
  }
}

function normalizeAnswer(value: string, question: ReaderQuestion): string {
  const settings = question.normalization ?? {};
  if ((settings.unicode ?? "NFC") !== "none")
    value = value.normalize(settings.unicode ?? "NFC");
  if (settings.trim ?? true) value = value.trim();
  if (settings.collapse_whitespace) value = value.replace(/\s+/gu, " ");
  if (!(settings.case_sensitive ?? false)) value = value.toLocaleLowerCase();
  return value;
}

export function evaluateQuestion(
  question: ReaderQuestion,
  response: unknown,
): boolean | null {
  if (!responseComplete(question, response)) return false;
  if (question.evaluation === "manual" || question.evaluation === "ungraded")
    return null;
  switch (question.type) {
    case "multiple_select":
      return (
        JSON.stringify([...(response as string[])].sort()) ===
        JSON.stringify([...(question.answer as string[])].sort())
      );
    case "true_false":
      return (response === "true") === question.answer;
    case "numeric": {
      const tolerance =
        typeof question.tolerance === "number"
          ? { absolute: question.tolerance }
          : (question.tolerance ?? { absolute: 0 });
      const parsed = numericResponse(response)!;
      const difference = Math.abs(parsed - Number(question.answer));
      return (
        (tolerance.absolute !== undefined &&
          difference <= tolerance.absolute) ||
        (tolerance.relative !== undefined &&
          difference <= tolerance.relative * Math.abs(Number(question.answer)))
      );
    }
    case "short_answer":
      return (question.answers ?? [String(question.answer)]).some(
        (answer) =>
          normalizeAnswer(String(response), question) ===
          normalizeAnswer(answer, question),
      );
    case "essay":
    case "open_response":
      return null;
    case "matching": {
      const expected = question.answer as Record<string, string>;
      const actual = response as Record<string, string>;
      return Object.keys(expected).every(
        (key) => actual[key] === expected[key],
      );
    }
    case "ordering":
      return JSON.stringify(response) === JSON.stringify(question.answer);
    default:
      return response === question.answer;
  }
}

export function earnedPoints(
  question: ReaderQuestion,
  response: unknown,
): number {
  if (!responseComplete(question, response)) return 0;
  if (
    question.type === "multiple_choice" &&
    question.options?.some((option) => option.weight !== undefined)
  ) {
    return (
      (question.options.find((option) => option.id === response)?.weight ?? 0) *
      question.points
    );
  }
  if (question.scoring === "partial" && question.type === "multiple_select") {
    const selected = new Set(response as string[]);
    const correct = new Set(question.answer as string[]);
    const incorrectTotal = (question.options?.length ?? 0) - correct.size;
    const correctSelected = [...selected].filter((id) =>
      correct.has(id),
    ).length;
    const incorrectSelected = [...selected].filter(
      (id) => !correct.has(id),
    ).length;
    return (
      Math.max(
        0,
        correctSelected / correct.size -
          (incorrectTotal ? incorrectSelected / incorrectTotal : 0),
      ) * question.points
    );
  }
  if (question.scoring === "partial" && question.type === "matching") {
    const expected = question.answer as Record<string, string>;
    const actual = response as Record<string, string>;
    return (
      (Object.keys(expected).filter((key) => actual[key] === expected[key])
        .length /
        Object.keys(expected).length) *
      question.points
    );
  }
  if (question.scoring === "partial" && question.type === "ordering") {
    const expected = question.answer as string[];
    const actual = response as string[];
    return (
      (expected.filter((value, index) => actual[index] === value).length /
        expected.length) *
      question.points
    );
  }
  return evaluateQuestion(question, response) ? question.points : 0;
}

export function countWords(response: string): number {
  const value = response.trim();
  return value ? value.split(/\s+/u).length : 0;
}

export function countSentences(response: string): number {
  const value = response.trim();
  if (!value) return 0;
  const terminal =
    value.match(/[^.!?]+[.!?]+/gu)?.filter((part) => part.trim()).length ?? 0;
  return terminal + (value.replace(/[^.!?]+[.!?]+/gu, "").trim() ? 1 : 0);
}

function keywordMatches(response: string, keywords: readonly string[]): number {
  const value = response.toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  return new Set(
    keywords.filter((keyword) => {
      const needle = keyword.toLocaleLowerCase().replace(/\s+/gu, " ").trim();
      if (!needle) return false;
      if (/^[\p{L}\p{N}_-]+$/u.test(needle)) {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(
          `(^|[^\\p{L}\\p{N}_-])${escaped}($|[^\\p{L}\\p{N}_-])`,
          "u",
        ).test(value);
      }
      return value.includes(needle);
    }),
  ).size;
}

export function evaluateResponse(
  question: ReaderQuestion,
  response: unknown,
  requireCorrect: boolean,
): EvaluationResult {
  if (question.type === "essay" || question.type === "open_response") {
    const value = String(response ?? "");
    const words = countWords(value);
    const sentences = countSentences(value);
    const matches = keywordMatches(value, question.keywords ?? []);
    const feedback: string[] = [];
    if (question.minimum_sentences && sentences < question.minimum_sentences)
      feedback.push(
        `Write at least ${question.minimum_sentences} sentences. Current: ${sentences}.`,
      );
    if (question.minimum_words && words < question.minimum_words)
      feedback.push(
        `Write at least ${question.minimum_words} words. Current: ${words}.`,
      );
    const requiredKeywords = question.keywords?.length
      ? (question.minimum_keywords ?? question.keywords.length)
      : 0;
    if (matches < requiredKeywords)
      feedback.push(
        `Mention at least ${requiredKeywords} required concepts. Current: ${matches}.`,
      );
    if (
      !question.minimum_words &&
      !question.minimum_sentences &&
      !requiredKeywords &&
      !value.trim()
    )
      feedback.push("Write a response before continuing.");
    return {
      complete: feedback.length === 0,
      correct: null,
      earned: null,
      feedback,
    };
  }
  if (!responseComplete(question, response)) {
    return {
      complete: false,
      correct: null,
      earned: 0,
      feedback: ["Add a response first."],
    };
  }
  const correct = evaluateQuestion(question, response);
  return {
    complete: requireCorrect ? correct === true : true,
    correct,
    earned: correct === null ? null : earnedPoints(question, response),
    feedback: [],
  };
}
