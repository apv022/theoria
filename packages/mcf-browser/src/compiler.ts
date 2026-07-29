import type {
  Activity,
  Chapter,
  Lesson,
  McfPackage,
  Question,
} from "mcf-npm/model";
import { zipSync } from "fflate";
import type { VirtualFile } from "./vfs";

const encoder = new TextEncoder();
const fixedDate = new Date("1980-01-02T00:00:00.000Z");

const escapeHtml = (value: unknown): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function inlineMarkdown(source: string): string {
  return escapeHtml(source)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

export function renderSafeMarkdown(source: string): string {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const output: string[] = [];
  let fenced = false;
  let paragraph: string[] = [];
  let listOpen = false;
  const flush = () => {
    if (paragraph.length)
      output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
    if (listOpen) {
      output.push("</ul>");
      listOpen = false;
    }
  };
  for (const line of lines) {
    if (line.startsWith("```")) {
      flush();
      output.push(fenced ? "</code></pre>" : "<pre><code>");
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      output.push(`${escapeHtml(line)}\n`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1]?.length ?? 2;
      output.push(`<h${level}>${inlineMarkdown(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    const list = /^[-*]\s+(.+)$/.exec(line);
    if (list) {
      if (paragraph.length) flush();
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${inlineMarkdown(list[1] ?? "")}</li>`);
      continue;
    }
    if (!line.trim()) flush();
    else paragraph.push(line.trim());
  }
  flush();
  if (fenced) output.push("</code></pre>");
  return output.join("\n");
}

interface LearnerCourse {
  readonly id: string;
  readonly title: string;
  readonly language: string;
  readonly kind: "course" | "module" | "lesson";
  readonly chapters: readonly Chapter[];
}

export function asLearnerCourse(value: McfPackage): LearnerCourse | undefined {
  if (value.kind === "course") return value;
  if (value.kind === "module") {
    return {
      id: value.id,
      title: value.title,
      language: value.language,
      kind: "module",
      chapters: [
        {
          id: "module",
          title: value.title,
          source: "",
          lessons: value.lessons,
        },
      ],
    };
  }
  if (value.kind === "lesson") {
    return {
      id: value.id,
      title: value.title,
      language: value.language,
      kind: "lesson",
      chapters: [
        {
          id: "lesson",
          title: value.title,
          source: "",
          lessons: [value.lesson],
        },
      ],
    };
  }
  return undefined;
}

function questionControl(question: Question): string {
  const name = escapeHtml(question.id);
  if (
    question.type === "matching" &&
    question.premises?.length &&
    question.responses?.length
  ) {
    return question.premises
      .map(
        (premise) =>
          `<label class="match-row">${inlineMarkdown(premise.text)}<select name="${name}:${escapeHtml(premise.id)}"><option value="">Choose…</option>${question.responses?.map((response) => `<option value="${escapeHtml(response.id)}">${inlineMarkdown(response.text)}</option>`).join("")}</select></label>`,
      )
      .join("");
  }
  if (question.type === "ordering" && question.items?.length) {
    return question.items
      .map(
        (item) =>
          `<label class="match-row">${inlineMarkdown(item.text)}<select name="${name}:${escapeHtml(item.id)}"><option value="">Position…</option>${question.items?.map((_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label>`,
      )
      .join("");
  }
  if (question.options?.length) {
    const type = question.type === "multiple_select" ? "checkbox" : "radio";
    return question.options
      .map(
        (option) =>
          `<label class="option"><input type="${type}" name="${name}" value="${escapeHtml(option.id)}"> ${inlineMarkdown(option.text)}</label>`,
      )
      .join("");
  }
  if (question.type === "true_false") {
    return ["true", "false"]
      .map(
        (value) =>
          `<label class="option"><input type="radio" name="${name}" value="${value}"> ${value[0]?.toUpperCase()}${value.slice(1)}</label>`,
      )
      .join("");
  }
  if (question.type === "essay" || question.type === "open_response") {
    return `<textarea name="${name}" rows="6"></textarea>`;
  }
  return `<input name="${name}" type="${question.type === "numeric" ? "number" : "text"}">`;
}

function renderQuestion(question: Question): string {
  return `<fieldset class="question" data-id="${escapeHtml(question.id)}" data-type="${escapeHtml(question.type)}">
    <legend>${inlineMarkdown(question.prompt)}</legend>
    ${questionControl(question)}
    ${question.hint ? `<details><summary>Hint</summary>${renderSafeMarkdown(question.hint)}</details>` : ""}
    <p class="feedback" aria-live="polite"></p>
  </fieldset>`;
}

function renderActivity(activity: Activity): string {
  return `<section class="activity" data-activity="${escapeHtml(activity.id)}">
    <p class="activity-type">${escapeHtml(activity.type)}${activity.evaluation ? ` · ${escapeHtml(activity.evaluation)}` : ""}</p>
    ${activity.title ? `<h3>${escapeHtml(activity.title)}</h3>` : ""}
    <div class="content">${renderSafeMarkdown(activity.content)}</div>
    ${activity.questions.map(renderQuestion).join("")}
    <button type="button" data-complete>${activity.type === "notes" ? "Mark activity complete" : activity.type === "practice" ? "Check answers" : "Submit activity"}</button>
    <p class="activity-result" aria-live="polite"></p>
  </section>`;
}

function renderLesson(lesson: Lesson, chapter: Chapter, index: number): string {
  return `<article class="lesson" data-lesson="${escapeHtml(lesson.id)}"${index ? " hidden" : ""}>
    <p class="eyebrow">${escapeHtml(chapter.title)}</p>
    <h2>${escapeHtml(lesson.title)}</h2>
    ${lesson.description ? `<p class="lede">${escapeHtml(lesson.description)}</p>` : ""}
    ${lesson.activities.map(renderActivity).join("")}
  </article>`;
}

const styles = `:root{color-scheme:light;--ink:#17201c;--paper:#f5f1e8;--line:#cec8ba;--accent:#d05b36}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 system-ui,sans-serif}.shell{display:grid;grid-template-columns:18rem 1fr;min-height:100vh}aside{padding:2rem;border-right:1px solid var(--line);background:#ece7dc;position:sticky;top:0;height:100vh;overflow:auto}main{width:min(100% - 3rem,52rem);margin:0 auto;padding:4rem 0 8rem}h1,h2,h3{font-family:Georgia,serif;line-height:1.1}h1{font-size:2rem}h2{font-size:clamp(2.4rem,7vw,5rem);margin:.3rem 0 2rem}.eyebrow,.activity-type{text-transform:uppercase;letter-spacing:.12em;font-size:.72rem;font-weight:700;color:#68716c}.lesson-link{display:block;width:100%;padding:.7rem 0;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;font:inherit;cursor:pointer}.lesson-link[aria-current=true]{color:var(--accent);font-weight:700}.activity{background:#fff;border:1px solid var(--line);padding:1.5rem;margin:2rem 0}.activity.complete{border-left:5px solid #4c735e}.question{border:0;border-top:1px solid var(--line);padding:1.2rem 0;margin:1rem 0}.option{display:block;padding:.35rem}.match-row{display:grid;grid-template-columns:1fr 12rem;gap:1rem;align-items:center;padding:.35rem 0}input[type=text],input[type=number],textarea,select{width:100%;font:inherit;padding:.7rem;border:1px solid var(--line);background:white}.feedback,.activity-result{min-height:1.4rem;color:#4c735e;font-weight:600}button{font:inherit;padding:.65rem .9rem;border:1px solid var(--ink);background:var(--ink);color:white;cursor:pointer}pre{overflow:auto;padding:1rem;background:#202622;color:#f8f5ed}.progress{height:.35rem;background:#d7d1c4}.progress i{display:block;height:100%;background:var(--accent)}@media(max-width:760px){.shell{display:block}aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{width:min(100% - 2rem,52rem);padding-top:2rem}.match-row{grid-template-columns:1fr}}`;

const runtime = `(() => {
  const key = "theoria-compiled:" + document.body.dataset.package;
  const course = window.MCF_PACKAGE;
  const activities = course.chapters.flatMap(chapter => chapter.lessons.flatMap(lesson => lesson.activities));
  const definitions = new Map(activities.map(activity => [activity.id, activity]));
  let state = { lesson: 0, complete: [], responses: {}, assessments: {} };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(key) || "{}") }; } catch {}
  const lessons = [...document.querySelectorAll("[data-lesson]")];
  const links = [...document.querySelectorAll("[data-lesson-link]")];
  const response = (question, fieldset) => {
    const controls = [...fieldset.querySelectorAll("input,textarea,select")];
    if (question.type === "multiple_select") return controls.filter(control => control.checked).map(control => control.value);
    if (question.type === "matching" || question.type === "ordering")
      return Object.fromEntries(controls.map(control => [control.name.split(":").slice(1).join(":"), control.value]));
    return controls.find(control => control.checked)?.value ?? controls[0]?.value ?? "";
  };
  const normalized = (question, value) => {
    let text = String(value ?? "");
    if (question.normalization?.trim !== false) text = text.trim();
    if (question.normalization?.collapse_whitespace) text = text.replace(/\\s+/g, " ");
    if (!question.normalization?.case_sensitive) text = text.toLocaleLowerCase();
    if (question.normalization?.unicode && question.normalization.unicode !== "none")
      text = text.normalize(question.normalization.unicode);
    return text;
  };
  const correct = (question, value) => {
    if (question.evaluation === "manual" || question.type === "essay" || question.type === "open_response")
      return null;
    if (question.type === "multiple_select")
      return JSON.stringify([...(value || [])].sort()) === JSON.stringify([...(question.answer || question.answers || [])].sort());
    if (question.type === "true_false") return (value === "true") === question.answer;
    if (question.type === "numeric") {
      const target = Number(question.answer), actual = Number(value);
      if (!Number.isFinite(actual)) return false;
      const tolerance = typeof question.tolerance === "number" ? question.tolerance : question.tolerance?.absolute ?? 0;
      const relative = typeof question.tolerance === "object" ? question.tolerance?.relative ?? 0 : 0;
      return Math.abs(actual - target) <= Math.max(tolerance, Math.abs(target) * relative);
    }
    if (question.type === "short_answer") return normalized(question, value) === normalized(question, question.answer);
    if (question.type === "matching") {
      const answer = question.answer || Object.fromEntries((question.premises || []).map((item, index) => [item.id, question.answers?.[index]]));
      return Object.keys(answer).every(id => value?.[id] === answer[id]);
    }
    if (question.type === "ordering") {
      const ordered = Object.entries(value || {}).sort((a, b) => Number(a[1]) - Number(b[1])).map(item => item[0]);
      return JSON.stringify(ordered) === JSON.stringify(question.answer || question.answers || []);
    }
    return value === question.answer;
  };
  const save = () => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} };
  const refresh = () => {
    lessons.forEach((lesson, index) => lesson.toggleAttribute("hidden", index !== state.lesson));
    links.forEach((link, index) => link.setAttribute("aria-current", String(index === state.lesson)));
    document.querySelectorAll("[data-activity]").forEach((activity) => {
      activity.classList.toggle("complete", state.complete.includes(activity.dataset.activity));
    });
    const total = document.querySelectorAll("[data-activity]").length;
    const bar = document.querySelector(".progress i");
    if (bar) bar.style.width = (total ? state.complete.length / total * 100 : 0) + "%";
    save();
  };
  links.forEach((link, index) => link.addEventListener("click", () => {
    state.lesson = index; refresh(); scrollTo({ top: 0, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-activity]").forEach(element => {
    const activity = definitions.get(element.dataset.activity);
    element.querySelectorAll("[data-id]").forEach(fieldset => {
      const question = activity.questions.find(item => item.id === fieldset.dataset.id);
      fieldset.addEventListener("change", () => {
        state.responses[activity.id + ":" + question.id] = response(question, fieldset); save();
      });
    });
    element.querySelector("[data-complete]").addEventListener("click", () => {
      const checks = activity.questions.map(question => {
        const fieldset = element.querySelector('[data-id="' + CSS.escape(question.id) + '"]');
        const value = response(question, fieldset);
        state.responses[activity.id + ":" + question.id] = value;
        const outcome = correct(question, value);
        fieldset.querySelector(".feedback").textContent =
          outcome === null ? "Saved for manual evaluation." : outcome ? "Correct." : "Not correct yet.";
        return { question, outcome, value };
      });
      if (activity.type === "notes") {
        state.complete = [...new Set([...state.complete, activity.id])];
      } else {
        const automatic = checks.filter(item => item.outcome !== null);
        const possible = automatic.reduce((sum, item) => sum + (item.question.points ?? 1), 0);
        const earned = automatic.filter(item => item.outcome).reduce((sum, item) => sum + (item.question.points ?? 1), 0);
        const score = possible ? earned / possible : 1;
        const manual = checks.some(item => item.outcome === null);
        const passed = score >= (activity.passing_score ?? 0);
        state.assessments[activity.id] = { score, passed, manual };
        element.querySelector(".activity-result").textContent =
          Math.round(score * 100) + "% automatic score" + (manual ? " · manual review pending" : passed ? " · passed" : " · retry available");
        if (activity.type === "practice" ? checks.every(item => item.outcome !== false) : passed && !manual)
          state.complete = [...new Set([...state.complete, activity.id])];
      }
      refresh();
    });
  }));
  refresh();
})();`;

export function compileLearnerPackage(
  value: McfPackage,
  sourceFiles: readonly VirtualFile[],
): Uint8Array {
  const course = asLearnerCourse(value);
  if (!course)
    throw new Error(`Package kind "${value.kind}" is not learner-renderable.`);
  const lessons = course.chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({ chapter, lesson })),
  );
  const navigation = lessons
    .map(
      ({ lesson }, index) =>
        `<button class="lesson-link" data-lesson-link type="button"${index ? "" : ' aria-current="true"'}>${escapeHtml(lesson.title)}</button>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="${escapeHtml(course.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(course.title)}</title><style>${styles}</style></head>
<body data-package="${escapeHtml(course.id)}"><div class="shell"><aside><p class="eyebrow">${escapeHtml(course.kind)} · MCF</p><h1>${escapeHtml(course.title)}</h1><div class="progress" aria-label="Progress"><i></i></div><nav aria-label="Lessons">${navigation}</nav></aside>
<main>${lessons.map(({ lesson, chapter }, index) => renderLesson(lesson, chapter, index)).join("")}</main></div><script>window.MCF_PACKAGE=${JSON.stringify(course).replaceAll("<", "\\u003c")};</script><script>${runtime}</script></body></html>`;
  const archive: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {
    "index.html": [encoder.encode(html), { mtime: fixedDate }],
  };
  for (const file of sourceFiles) {
    if (/^(?:assets\/|LICENSE|ATTRIBUTION|README)/i.test(file.path)) {
      archive[`source/${file.path}`] = [file.bytes, { mtime: fixedDate }];
    }
  }
  return zipSync(archive, { level: 6 });
}

export function countPackage(value: McfPackage): {
  readonly lessons: number;
  readonly activities: number;
  readonly questions: number;
} {
  const course = asLearnerCourse(value);
  if (!course)
    return {
      lessons: 0,
      activities: 0,
      questions: value.kind === "question_bank" ? value.questions.length : 0,
    };
  const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
  const activities = lessons.flatMap((lesson) => lesson.activities);
  return {
    lessons: lessons.length,
    activities: activities.length,
    questions: activities.reduce(
      (total, activity) => total + activity.questions.length,
      0,
    ),
  };
}

export function previewHtmlFromArtifact(artifact: Uint8Array): string {
  // The browser UI extracts index.html with the same audited archive reader; this helper is
  // intentionally implemented in engine.ts to keep fflate out of React components.
  return String(artifact.byteLength);
}
