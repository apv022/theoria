"use client";

import {
  WorkerMcfEngine,
  type ReaderPackage,
  type SerializedFile,
} from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import {
  packageId as asPackageId,
  type LearnerProgress,
  type LearnerQuestionState,
  type LibraryEntry,
} from "@theoria/package-model";
import {
  activityKey,
  checkQuestion,
  compatibleProgress,
  coursePercent,
  lessonsOf,
  markActivityComplete,
  markActivityViewed,
  prepareActivity,
  questionKey,
  recordResponse,
  refreshAllCompletion,
  renderRichContent,
  submitAssessment,
  submitAssignment,
  toReaderStructure,
  type AssetResolver,
  type ReaderActivity,
  type ReaderQuestion,
  type ReaderStructure,
} from "@theoria/reader";
import { Button, Status } from "@theoria/ui";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SyncStatus } from "./sync-status";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

const mime = (path: string): string => {
  const extension = path.split(".").pop()?.toLowerCase();
  return (
    {
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      mp3: "audio/mpeg",
      ogg: "audio/ogg",
      wav: "audio/wav",
      mp4: "video/mp4",
      webm: "video/webm",
      vtt: "text/vtt",
      txt: "text/plain",
      md: "text/markdown",
    }[extension ?? ""] ?? "application/octet-stream"
  );
};

const createAssets = (
  files: readonly SerializedFile[],
): { readonly resolve: AssetResolver; readonly revoke: () => void } => {
  const urls = new Map<string, string>();
  for (const file of files) {
    if (file.path === "manifest.yaml" || file.path.endsWith(".mcf")) continue;
    urls.set(
      file.path,
      URL.createObjectURL(new Blob([file.bytes], { type: mime(file.path) })),
    );
  }
  return {
    resolve: (path) => urls.get(path),
    revoke: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
};

function RichContent({
  source,
  lesson,
  course,
  resolveAsset,
}: {
  readonly source: string;
  readonly lesson: ReturnType<typeof lessonsOf>[number];
  readonly course: ReaderStructure;
  readonly resolveAsset: AssetResolver;
}) {
  const rendered = useMemo(
    () => renderRichContent(source, lesson, course, resolveAsset),
    [course, lesson, resolveAsset, source],
  );
  return (
    <>
      <div
        className="reader-rich"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
      {rendered.hasRemoteResources ? (
        <p className="offline-limit">
          Some media is remote and may be unavailable offline.
        </p>
      ) : null}
    </>
  );
}

function Rubric({
  rubricId,
  lesson,
  course,
  resolveAsset,
}: {
  readonly rubricId: string | undefined;
  readonly lesson: ReturnType<typeof lessonsOf>[number];
  readonly course: ReaderStructure;
  readonly resolveAsset: AssetResolver;
}) {
  const rubric = rubricId
    ? ((lesson.rubrics ?? []).find((item) => item.id === rubricId) ??
      (course.rubrics ?? []).find((item) => item.id === rubricId))
    : undefined;
  if (!rubric) return null;
  return (
    <section className="reader-rubric" aria-labelledby={`rubric-${rubric.id}`}>
      <h4 id={`rubric-${rubric.id}`}>{rubric.title}</h4>
      {rubric.description ? (
        <RichContent
          source={rubric.description}
          lesson={lesson}
          course={course}
          resolveAsset={resolveAsset}
        />
      ) : null}
      <div className="rubric-scroll">
        <table>
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Levels</th>
            </tr>
          </thead>
          <tbody>
            {rubric.criteria.map((criterion) => (
              <tr key={criterion.id}>
                <th scope="row">
                  <RichContent
                    source={criterion.description}
                    lesson={lesson}
                    course={course}
                    resolveAsset={resolveAsset}
                  />
                </th>
                <td>
                  <ul>
                    {criterion.levels.map((level) => (
                      <li key={level.id}>
                        <RichContent
                          source={level.description}
                          lesson={lesson}
                          course={course}
                          resolveAsset={resolveAsset}
                        />
                        <span>{level.points} points</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Manual review is required; Theoria does not invent a grade.</p>
    </section>
  );
}

function OrderingControl({
  question,
  value,
  state,
  lesson,
  course,
  resolveAsset,
  onChange,
}: {
  readonly question: ReaderQuestion;
  readonly value: unknown;
  readonly state: LearnerQuestionState | undefined;
  readonly lesson: ReturnType<typeof lessonsOf>[number];
  readonly course: ReaderStructure;
  readonly resolveAsset: AssetResolver;
  readonly onChange: (value: unknown) => void;
}) {
  const ids = Array.isArray(value)
    ? (value as string[])
    : (question.items ?? []).map((item) => item.id);
  const items = new Map((question.items ?? []).map((item) => [item.id, item]));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    const item = next[index]!;
    next[index] = next[target]!;
    next[target] = item;
    onChange(next);
  };
  return (
    <ol className="ordering-control" aria-label="Items to order">
      {ids.map((id, index) => (
        <li key={id}>
          <div id={`ordering-${question.id}-${id}`}>
            <RichContent
              source={items.get(id)?.text ?? id}
              lesson={lesson}
              course={course}
              resolveAsset={resolveAsset}
            />
            {state?.checked &&
            items.get(id) &&
            "feedback" in items.get(id)! &&
            typeof items.get(id)!.feedback === "string" ? (
              <div className="reader-option-feedback">
                <RichContent
                  source={String(items.get(id)!.feedback)}
                  lesson={lesson}
                  course={course}
                  resolveAsset={resolveAsset}
                />
              </div>
            ) : null}
          </div>
          <span className="actions">
            <Button
              className="button-secondary"
              aria-label={`Move item ${index + 1} up`}
              aria-describedby={`ordering-${question.id}-${id}`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </Button>
            <Button
              className="button-secondary"
              aria-label={`Move item ${index + 1} down`}
              aria-describedby={`ordering-${question.id}-${id}`}
              disabled={index === ids.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </Button>
          </span>
        </li>
      ))}
    </ol>
  );
}

function QuestionControl({
  question,
  state,
  matchingOrder,
  orderingOrder,
  lesson,
  course,
  resolveAsset,
  onChange,
}: {
  readonly question: ReaderQuestion;
  readonly state: LearnerQuestionState | undefined;
  readonly matchingOrder: readonly string[] | undefined;
  readonly orderingOrder: readonly string[] | undefined;
  readonly lesson: ReturnType<typeof lessonsOf>[number];
  readonly course: ReaderStructure;
  readonly resolveAsset: AssetResolver;
  readonly onChange: (value: unknown) => void;
}) {
  const response = state?.response;
  if (question.type === "multiple_choice" || question.type === "true_false") {
    const options =
      question.type === "true_false"
        ? [
            { id: "true", text: "True" },
            { id: "false", text: "False" },
          ]
        : (question.options ?? []);
    return options.map((option) => {
      const inputId = `${question.id}-${option.id}`;
      return (
        <div className="reader-option" key={option.id}>
          <input
            id={inputId}
            type="radio"
            name={question.id}
            value={option.id}
            checked={response === option.id}
            onChange={(event) => onChange(event.target.value)}
          />
          <label htmlFor={inputId}>
            <RichContent
              source={option.text}
              lesson={lesson}
              course={course}
              resolveAsset={resolveAsset}
            />
          </label>
          {"feedback" in option &&
          option.feedback &&
          state?.checked &&
          response === option.id ? (
            <div className="reader-option-feedback">
              <RichContent
                source={option.feedback}
                lesson={lesson}
                course={course}
                resolveAsset={resolveAsset}
              />
            </div>
          ) : null}
        </div>
      );
    });
  }
  if (question.type === "multiple_select") {
    const selected = Array.isArray(response) ? (response as string[]) : [];
    return (question.options ?? []).map((option) => {
      const inputId = `${question.id}-${option.id}`;
      return (
        <div className="reader-option" key={option.id}>
          <input
            id={inputId}
            type="checkbox"
            value={option.id}
            checked={selected.includes(option.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, option.id]
                  : selected.filter((id) => id !== option.id),
              )
            }
          />
          <label htmlFor={inputId}>
            <RichContent
              source={option.text}
              lesson={lesson}
              course={course}
              resolveAsset={resolveAsset}
            />
          </label>
          {option.feedback && state?.checked && selected.includes(option.id) ? (
            <div className="reader-option-feedback">
              <RichContent
                source={option.feedback}
                lesson={lesson}
                course={course}
                resolveAsset={resolveAsset}
              />
            </div>
          ) : null}
        </div>
      );
    });
  }
  if (question.type === "matching") {
    const value =
      response && typeof response === "object" && !Array.isArray(response)
        ? (response as Record<string, string>)
        : {};
    const responses = new Map(
      (question.responses ?? []).map((item) => [item.id, item]),
    );
    const selected = new Set(Object.values(value).filter(Boolean));
    return (
      <div className="matching-control">
        {(question.premises ?? []).map((premise) => (
          <fieldset className="matching-premise" key={premise.id}>
            <legend>
              <RichContent
                source={premise.text}
                lesson={lesson}
                course={course}
                resolveAsset={resolveAsset}
              />
            </legend>
            <div className="matching-responses">
              {(matchingOrder ?? []).map((id) => (
                <div className="reader-option" key={id}>
                  <input
                    id={`${question.id}-${premise.id}-${id}`}
                    type="radio"
                    name={`${question.id}-${premise.id}`}
                    value={id}
                    checked={value[premise.id] === id}
                    disabled={
                      !question.reuse_responses &&
                      id !== value[premise.id] &&
                      selected.has(id)
                    }
                    onChange={(event) =>
                      onChange({ ...value, [premise.id]: event.target.value })
                    }
                  />
                  <label htmlFor={`${question.id}-${premise.id}-${id}`}>
                    <RichContent
                      source={responses.get(id)?.text ?? id}
                      lesson={lesson}
                      course={course}
                      resolveAsset={resolveAsset}
                    />
                  </label>
                  {state?.checked &&
                  value[premise.id] === id &&
                  responses.get(id) &&
                  "feedback" in responses.get(id)! &&
                  typeof responses.get(id)!.feedback === "string" ? (
                    <div className="reader-option-feedback">
                      <RichContent
                        source={String(responses.get(id)!.feedback)}
                        lesson={lesson}
                        course={course}
                        resolveAsset={resolveAsset}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    );
  }
  if (question.type === "ordering") {
    return (
      <OrderingControl
        question={question}
        value={response ?? orderingOrder}
        state={state}
        lesson={lesson}
        course={course}
        resolveAsset={resolveAsset}
        onChange={onChange}
      />
    );
  }
  if (question.type === "essay" || question.type === "open_response") {
    return (
      <textarea
        rows={7}
        value={String(response ?? "")}
        onChange={(event) => onChange(event.target.value)}
        aria-label={
          question.type === "essay" ? "Essay response" : "Open response"
        }
      />
    );
  }
  return (
    <label className="text-response">
      <span className="sr-only">Response</span>
      <input
        type={question.type === "numeric" ? "number" : "text"}
        step={question.type === "numeric" ? "any" : undefined}
        value={String(response ?? "")}
        onChange={(event) => onChange(event.target.value)}
      />
      {question.unit ? <span>{question.unit}</span> : null}
    </label>
  );
}

function QuestionView({
  question,
  lesson,
  activity,
  course,
  progress,
  resolveAsset,
  assessment,
  onProgress,
}: {
  readonly question: ReaderQuestion;
  readonly lesson: ReturnType<typeof lessonsOf>[number];
  readonly activity: ReaderActivity;
  readonly course: ReaderStructure;
  readonly progress: LearnerProgress;
  readonly resolveAsset: AssetResolver;
  readonly assessment: boolean;
  readonly onProgress: (state: LearnerProgress) => void;
}) {
  const [message, setMessage] = useState<string>();
  const [hint, setHint] = useState(false);
  const key = questionKey(lesson.id, activity.id, question.id);
  const state = progress.questions[key];
  const update = (value: unknown) =>
    onProgress(recordResponse(progress, lesson.id, activity, question, value));
  const check = () => {
    const result = checkQuestion(progress, lesson.id, activity, question);
    onProgress(result.state);
    setMessage(
      result.result.feedback[0] ??
        (result.result.correct === null
          ? question.evaluation === "manual"
            ? "Response saved. Manual review is pending."
            : "Completion requirements met."
          : result.result.correct
            ? "Correct — nicely done."
            : "Not quite. Try again."),
    );
  };
  return (
    <section className="reader-question" aria-labelledby={`question-${key}`}>
      <div id={`question-${key}`}>
        <RichContent
          source={question.prompt}
          lesson={lesson}
          course={course}
          resolveAsset={resolveAsset}
        />
      </div>
      <div className="reader-responses">
        <QuestionControl
          question={question}
          state={state}
          matchingOrder={progress.matchingOrders[key]}
          orderingOrder={progress.orderingOrders[key]}
          lesson={lesson}
          course={course}
          resolveAsset={resolveAsset}
          onChange={update}
        />
      </div>
      <div className="question-actions">
        {question.hint ? (
          <Button
            className="button-secondary"
            aria-expanded={hint}
            onClick={() => setHint((value) => !value)}
          >
            {hint ? "Hide hint" : "Show hint"}
          </Button>
        ) : null}
        {!assessment ? (
          <Button onClick={check}>
            {question.evaluation === "manual" ||
            question.evaluation === "ungraded"
              ? "Submit response"
              : question.evaluation === "completion" ||
                  question.type === "essay" ||
                  question.type === "open_response"
                ? "Check completion"
                : "Check answer"}
          </Button>
        ) : null}
      </div>
      {hint && question.hint ? (
        <div className="reader-feedback">
          <RichContent
            source={question.hint}
            lesson={lesson}
            course={course}
            resolveAsset={resolveAsset}
          />
        </div>
      ) : null}
      {message ? (
        <div className="reader-feedback" aria-live="polite">
          <RichContent
            source={message}
            lesson={lesson}
            course={course}
            resolveAsset={resolveAsset}
          />
        </div>
      ) : null}
      {state?.checked && question.explanation ? (
        <div className="reader-explanation">
          <RichContent
            source={question.explanation}
            lesson={lesson}
            course={course}
            resolveAsset={resolveAsset}
          />
        </div>
      ) : null}
      {question.evaluation === "manual" ? (
        <p className="manual-state">
          This response requires manual review. It is saved locally without a
          grade.
        </p>
      ) : null}
      {question.evaluation === "ungraded" ? (
        <p className="manual-state">
          This response is ungraded and saved without correctness evaluation.
        </p>
      ) : null}
      <Rubric
        rubricId={question.rubric}
        lesson={lesson}
        course={course}
        resolveAsset={resolveAsset}
      />
    </section>
  );
}

function AssignmentView({
  activity,
  lessonId,
  progress,
  onProgress,
}: {
  readonly activity: ReaderActivity;
  readonly lessonId: string;
  readonly progress: LearnerProgress;
  readonly onProgress: (state: LearnerProgress) => void;
}) {
  const existing =
    progress.assignmentSubmissions[activityKey(lessonId, activity.id)];
  const [text, setText] = useState(existing?.text ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [files, setFiles] = useState<
    readonly {
      readonly name: string;
      readonly size: number;
      readonly type: string;
    }[]
  >(existing?.files ?? []);
  const [message, setMessage] = useState<string>();
  if (!activity.submission) return null;
  return (
    <section className="assignment-ui">
      <h4>Submission requirements</h4>
      <dl>
        <dt>Modes</dt>
        <dd>{activity.submission.modes.join(", ")}</dd>
        <dt>Evaluation</dt>
        <dd>{activity.evaluation ?? "manual"}</dd>
      </dl>
      {activity.submission.modes.includes("text") ? (
        <label>
          Text response
          <textarea
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
      ) : null}
      {activity.submission.modes.includes("url") ? (
        <label>
          URL response
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
      ) : null}
      {activity.submission.modes.includes("file") ? (
        <label>
          Local file metadata
          <input
            type="file"
            multiple={activity.submission.maximum_files !== 1}
            accept={activity.submission.accepted_media_types?.join(",")}
            onChange={(event) =>
              setFiles(
                [...(event.target.files ?? [])].map((file) => ({
                  name: file.name,
                  size: file.size,
                  type: file.type,
                })),
              )
            }
          />
        </label>
      ) : null}
      <Button
        onClick={() => {
          const result = submitAssignment(progress, lessonId, activity, {
            text,
            url,
            files,
          });
          onProgress(result.state);
          setMessage(result.message);
        }}
      >
        Submit locally
      </Button>
      {message ? <p aria-live="polite">{message}</p> : null}
      <p>
        File names and metadata are saved; file contents are not uploaded.
        Instructor delivery requires a future host platform.
      </p>
    </section>
  );
}

function ActivityView({
  activity,
  lesson,
  course,
  progress,
  resolveAsset,
  onProgress,
}: {
  readonly activity: ReaderActivity;
  readonly lesson: ReturnType<typeof lessonsOf>[number];
  readonly course: ReaderStructure;
  readonly progress: LearnerProgress;
  readonly resolveAsset: AssetResolver;
  readonly onProgress: (state: LearnerProgress) => void;
}) {
  const [assessmentMessage, setAssessmentMessage] = useState<string>();
  const selected = new Set(
    progress.questionOrders[activityKey(lesson.id, activity.id)] ??
      activity.questions.map((question) => question.id),
  );
  const questions = activity.questions.filter((question) =>
    selected.has(question.id),
  );
  const complete =
    progress.activities[activityKey(lesson.id, activity.id)] ?? false;
  const prior = progress.assessments[activityKey(lesson.id, activity.id)];
  return (
    <section
      className={`reader-activity${complete ? " complete" : ""}`}
      aria-labelledby={`activity-${lesson.id}-${activity.id}`}
    >
      <div className="activity-heading">
        <div>
          <p>
            {activity.type} · {activity.evaluation ?? "automatic"}
          </p>
          <h3 id={`activity-${lesson.id}-${activity.id}`}>
            {activity.title ?? "Learning activity"}
          </h3>
        </div>
        {complete ? <Status tone="positive">Complete</Status> : null}
      </div>
      <RichContent
        source={activity.content}
        lesson={lesson}
        course={course}
        resolveAsset={resolveAsset}
      />
      <div className="reader-question-list">
        {questions.map((question) => (
          <QuestionView
            key={question.id}
            question={question}
            lesson={lesson}
            activity={activity}
            course={course}
            progress={progress}
            resolveAsset={resolveAsset}
            assessment={activity.type === "assessment"}
            onProgress={onProgress}
          />
        ))}
      </div>
      {activity.type === "notes" ? (
        <Button
          disabled={complete}
          onClick={() =>
            onProgress(markActivityComplete(progress, lesson.id, activity))
          }
        >
          {complete ? "Notes completed" : "Mark notes complete"}
        </Button>
      ) : null}
      {activity.type === "assessment" ? (
        <>
          <Button
            onClick={() => {
              const result = submitAssessment(progress, lesson.id, activity);
              onProgress(result.state);
              setAssessmentMessage(
                result.outcome.status === "incomplete"
                  ? `Complete required questions: ${result.outcome.missing.join(", ")}.`
                  : `${result.outcome.assessment.pendingManual ? "Provisional automatic score" : "Submitted score"}: ${Math.round(result.outcome.assessment.score * 100)}%. ${
                      result.outcome.assessment.pendingManual
                        ? "Manual review pending."
                        : result.outcome.assessment.passed === null
                          ? "Submission complete."
                          : result.outcome.assessment.passed
                            ? "Passed."
                            : "Not passed. Retry when ready."
                    }`,
              );
            }}
          >
            Submit assessment
          </Button>
          <p className="assessment-result" aria-live="polite">
            {assessmentMessage ??
              (prior
                ? `Previous score: ${Math.round(prior.score * 100)}%. ${
                    prior.pendingManual
                      ? "Manual review pending."
                      : prior.passed === false
                        ? "Not passed."
                        : prior.passed
                          ? "Passed."
                          : "Submitted."
                  }`
                : "")}
          </p>
        </>
      ) : null}
      {activity.type === "assignment" ? (
        <AssignmentView
          activity={activity}
          lessonId={lesson.id}
          progress={progress}
          onProgress={onProgress}
        />
      ) : null}
      <Rubric
        rubricId={activity.rubric}
        lesson={lesson}
        course={course}
        resolveAsset={resolveAsset}
      />
    </section>
  );
}

type ReaderStatus =
  | { readonly state: "loading" }
  | { readonly state: "error"; readonly message: string }
  | {
      readonly state: "ready";
      readonly entry: LibraryEntry;
      readonly course: ReaderStructure;
      readonly progress: LearnerProgress;
      readonly resolveAsset: AssetResolver;
    };

const previewProgress = (
  course: ReaderStructure,
  sourceChecksum: string,
): LearnerProgress => {
  let progress = compatibleProgress(
    undefined,
    asPackageId(`compiler-preview:${course.id}:${course.version}`),
    sourceChecksum,
    course,
  );
  for (const lesson of lessonsOf(course)) {
    for (const activity of lesson.activities)
      progress = prepareActivity(progress, lesson.id, activity).state;
  }
  return progress;
};

export function CompilerReaderPreview({
  readerPackage,
  sourceFiles,
  sourceChecksum,
}: {
  readonly readerPackage: ReaderPackage;
  readonly sourceFiles: readonly SerializedFile[];
  readonly sourceChecksum: string;
}) {
  const course = useMemo(
    () => toReaderStructure(readerPackage),
    [readerPackage],
  );
  const assets = useMemo(() => createAssets(sourceFiles), [sourceFiles]);
  const [progress, setProgress] = useState<LearnerProgress | undefined>();
  const [lessonId, setLessonId] = useState<string>();

  useEffect(() => () => assets.revoke(), [assets]);
  useEffect(() => {
    if (!course) return;
    const next = previewProgress(course, sourceChecksum);
    setProgress(next);
    setLessonId(lessonsOf(course)[0]?.id);
  }, [course, sourceChecksum]);

  if (!course)
    return (
      <div className="reader-error" role="alert">
        <h2>Preview unavailable</h2>
        <p>This package cannot be rendered as a learner course.</p>
      </div>
    );
  if (!progress || !lessonId)
    return (
      <div className="reader-loading" aria-busy="true">
        <h2>Preparing Reader preview…</h2>
      </div>
    );
  return (
    <ReaderCoursePresentation
      course={course}
      progress={progress}
      resolveAsset={assets.resolve}
      currentLessonId={lessonId}
      mode="preview"
      onProgress={setProgress}
      onLessonChange={setLessonId}
    />
  );
}

function ReaderCoursePresentation({
  course,
  progress,
  resolveAsset,
  currentLessonId,
  mode,
  onProgress,
  onLessonChange,
}: {
  readonly course: ReaderStructure;
  readonly progress: LearnerProgress;
  readonly resolveAsset: AssetResolver;
  readonly currentLessonId: string;
  readonly mode: "reader" | "preview";
  readonly onProgress: (next: LearnerProgress) => void;
  readonly onLessonChange: (lessonId: string) => void;
}) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const lessons = lessonsOf(course);
  const current =
    lessons.find((lesson) => lesson.id === currentLessonId) ?? lessons[0]!;
  const index = lessons.findIndex((lesson) => lesson.id === current.id);
  const percentage = coursePercent(course, progress);

  useEffect(() => {
    let next = progress;
    for (const activity of current.activities)
      next = markActivityViewed(next, current.id, activity);
    if (next !== progress) onProgress(next);
  }, [current, onProgress, progress]);

  const lessonLink = (lesson: ReturnType<typeof lessonsOf>[number]) =>
    mode === "reader" ? (
      <Link
        key={lesson.id}
        href={`/read/${encodeURIComponent(progress.packageId)}/${encodeURIComponent(lesson.id)}`}
        aria-current={lesson.id === current.id ? "page" : undefined}
        className={progress.lessons[lesson.id] ? "complete" : ""}
        onClick={(event) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            event.preventDefault();
            onLessonChange(lesson.id);
          }
        }}
      >
        <span aria-hidden="true">
          {progress.lessons[lesson.id]
            ? "✓"
            : lesson.id === current.id
              ? "→"
              : "·"}
        </span>
        {lesson.title}
      </Link>
    ) : (
      <button
        key={lesson.id}
        type="button"
        aria-current={lesson.id === current.id ? "page" : undefined}
        className={progress.lessons[lesson.id] ? "complete" : ""}
        onClick={() => {
          setOutlineOpen(false);
          onLessonChange(lesson.id);
        }}
      >
        <span aria-hidden="true">
          {progress.lessons[lesson.id]
            ? "✓"
            : lesson.id === current.id
              ? "→"
              : "·"}
        </span>
        {lesson.title}
      </button>
    );

  const lessonAction = (
    lesson: ReturnType<typeof lessonsOf>[number],
    direction: "previous" | "next",
  ) =>
    mode === "reader" ? (
      <Link
        className={`button${direction === "previous" ? " button-secondary" : ""}`}
        href={`/read/${encodeURIComponent(progress.packageId)}/${encodeURIComponent(lesson.id)}`}
        onClick={(event) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            event.preventDefault();
            onLessonChange(lesson.id);
          }
        }}
      >
        {direction === "previous" ? "← " : ""}
        {lesson.title}
        {direction === "next" ? " →" : ""}
      </Link>
    ) : (
      <Button
        className={direction === "previous" ? "button-secondary" : undefined}
        onClick={() => onLessonChange(lesson.id)}
      >
        {direction === "previous" ? "← " : ""}
        {lesson.title}
        {direction === "next" ? " →" : ""}
      </Button>
    );

  return (
    <div className="active-reader" data-reader-context={mode}>
      <aside className="reader-course-nav">
        <div className="reader-package-title">
          <p>
            {course.kind} · MCF {course.mcf}
          </p>
          <h1>{course.title}</h1>
          <div
            className="reader-progress-bar"
            aria-label={`${percentage}% complete`}
          >
            <i style={{ width: `${percentage}%` }} />
          </div>
          <strong>{percentage}% complete</strong>
          {mode === "reader" ? (
            <>
              <SyncStatus category="progress" stableId={progress.packageId} />
              <Link className="reader-exit-link" href="/library">
                Exit reader
              </Link>
            </>
          ) : null}
        </div>
        <button
          className="reader-outline-toggle"
          type="button"
          aria-expanded={outlineOpen}
          aria-controls="reader-package-contents"
          onClick={() => setOutlineOpen((value) => !value)}
        >
          Course outline
          <span aria-hidden="true">{outlineOpen ? "−" : "+"}</span>
        </button>
        <nav
          id="reader-package-contents"
          className={`reader-outline-nav${outlineOpen ? " open" : ""}`}
          aria-label="Package contents"
        >
          {course.chapters.map((chapter) => (
            <section key={chapter.id}>
              <h2>{chapter.title}</h2>
              {chapter.lessons.map(lessonLink)}
            </section>
          ))}
        </nav>
      </aside>
      <article className="reader-lesson" id="lesson">
        <header>
          <p className="chapter-label">
            Lesson {index + 1} of {lessons.length}
          </p>
          <h1>{current.title}</h1>
          {current.description ? <p>{current.description}</p> : null}
          {progress.lessons[current.id] ? (
            <Status tone="positive">Lesson complete</Status>
          ) : null}
        </header>
        {current.activities.map((activity) => (
          <ActivityView
            key={activity.id}
            activity={activity}
            lesson={current}
            course={course}
            progress={progress}
            resolveAsset={resolveAsset}
            onProgress={onProgress}
          />
        ))}
        <nav className="reader-lesson-nav" aria-label="Lesson navigation">
          {lessons[index - 1] ? (
            lessonAction(lessons[index - 1]!, "previous")
          ) : (
            <span />
          )}
          {lessons[index + 1] ? (
            lessonAction(lessons[index + 1]!, "next")
          ) : mode === "reader" ? (
            <Link className="button" href="/library">
              Return to library
            </Link>
          ) : (
            <span className="preview-complete">End of preview</span>
          )}
        </nav>
      </article>
    </div>
  );
}

export function ReaderExperience({
  packageId,
  lessonId,
  mode = "reader",
}: {
  readonly packageId: string;
  readonly lessonId?: string;
  readonly mode?: "reader" | "preview";
}) {
  const router = useRouter();
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const [status, setStatus] = useState<ReaderStatus>({ state: "loading" });
  const [offlineLessonId, setOfflineLessonId] = useState<string>();
  const [previewLessonId, setPreviewLessonId] = useState<string>();

  useEffect(() => {
    let active = true;
    let revoke = () => {};
    setStatus({ state: "loading" });
    const load = async () => {
      if (!store) {
        setStatus({
          state: "error",
          message: "IndexedDB is unavailable or blocked in this browser.",
        });
        return;
      }
      const id = asPackageId(packageId);
      const entry = await store.library.get(id);
      if (!entry) {
        setStatus({
          state: "error",
          message: "This package is not in the local library.",
        });
        return;
      }
      const source = await store.resolveLibrarySource(entry);
      const worker = await engine.initialize();
      if (worker.status !== "ready") {
        setStatus({
          state: "error",
          message:
            worker.status === "unsupported" || worker.status === "fatal"
              ? worker.status === "unsupported"
                ? worker.reason
                : worker.message
              : "The reader worker could not start.",
        });
        return;
      }
      const result = await engine.execute({
        type: "request",
        requestId: crypto.randomUUID(),
        operation: "inspect",
        input: {
          type: "archive",
          name: `${entry.packageId}.mcf.zip`,
          bytes: await source.archive.arrayBuffer(),
        },
      });
      if (!active) return;
      if (result.status !== "ok") {
        setStatus({
          state: "error",
          message:
            result.status === "error"
              ? result.diagnostics.map((item) => item.message).join(" ")
              : result.status === "unsupported"
                ? result.reason
                : "Opening the package was cancelled.",
        });
        return;
      }
      const course = toReaderStructure(result.readerPackage);
      if (!course) {
        setStatus({
          state: "error",
          message: `${result.readerPackage.kind} packages are not learner-renderable.`,
        });
        return;
      }
      const assets = createAssets(result.sourceFiles);
      revoke = assets.revoke;
      let progress = compatibleProgress(
        await store.progress.get(id),
        id,
        result.summary.sourceChecksum,
        course,
      );
      for (const lesson of lessonsOf(course)) {
        for (const activity of lesson.activities) {
          progress = prepareActivity(progress, lesson.id, activity).state;
        }
      }
      const available = lessonsOf(course);
      const requested =
        available.find((lesson) => lesson.id === lessonId)?.id ??
        available.find((lesson) => lesson.id === progress.currentLessonId)
          ?.id ??
        available[0]?.id;
      if (!requested) {
        setStatus({
          state: "error",
          message: "This package contains no readable lessons.",
        });
        return;
      }
      progress = refreshAllCompletion(course, {
        ...progress,
        currentLessonId: requested,
        lastOpenedAt: new Date().toISOString(),
      });
      if (mode === "reader")
        await Promise.all([
          store.progress.put(progress),
          store.library.put({
            ...entry,
            lastOpenedAt: new Date().toISOString(),
          }),
        ]);
      if (!active) return;
      setStatus({
        state: "ready",
        entry,
        course,
        progress,
        resolveAsset: assets.resolve,
      });
      if (!lessonId && mode === "reader")
        router.replace(
          `/read/${encodeURIComponent(packageId)}/${encodeURIComponent(requested)}`,
        );
    };
    void load().catch((reason) => {
      if (active)
        setStatus({
          state: "error",
          message:
            reason instanceof Error
              ? `Reader data could not be opened: ${reason.message}`
              : "Reader data could not be opened.",
        });
    });
    return () => {
      active = false;
      revoke();
      engine.dispose();
    };
  }, [engine, mode, packageId, router]);

  const commit = useCallback(
    (next: LearnerProgress) => {
      if (status.state !== "ready" || !store) return;
      const complete = refreshAllCompletion(status.course, next);
      setStatus({ ...status, progress: complete });
      if (mode === "reader") void store.progress.put(complete);
    },
    [mode, status],
  );

  const offlineCourse = status.state === "ready" ? status.course : undefined;
  useEffect(() => {
    if (
      !offlineCourse ||
      mode === "preview" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    )
      return;
    const urls = lessonsOf(offlineCourse).map(
      (lesson) =>
        `/read/${encodeURIComponent(packageId)}/${encodeURIComponent(lesson.id)}`,
    );
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: "CACHE_URLS", urls });
    });
  }, [mode, offlineCourse, packageId]);

  if (status.state === "loading") {
    return (
      <div className="reader-loading" aria-busy="true">
        <Image src="/theoria-mark.svg" width={64} height={64} alt="" />
        <h1>Opening your local package…</h1>
      </div>
    );
  }
  if (status.state === "error") {
    return (
      <div className="reader-error" role="alert">
        <h1>Reader unavailable</h1>
        <p>{status.message}</p>
        {mode === "reader" ? (
          <Link className="button" href="/library">
            Return to library
          </Link>
        ) : (
          <p>
            Return to Creation Studio and rebuild the preview after fixing the
            draft.
          </p>
        )}
      </div>
    );
  }
  return (
    <ReaderCoursePresentation
      course={status.course}
      progress={status.progress}
      resolveAsset={status.resolveAsset}
      currentLessonId={
        mode === "preview"
          ? (previewLessonId ??
            lessonId ??
            status.progress.currentLessonId ??
            lessonsOf(status.course)[0]!.id)
          : (offlineLessonId ??
            lessonId ??
            status.progress.currentLessonId ??
            lessonsOf(status.course)[0]!.id)
      }
      mode={mode}
      onProgress={commit}
      onLessonChange={(nextLessonId) => {
        if (mode === "preview") setPreviewLessonId(nextLessonId);
        else {
          if (
            status.state === "ready" &&
            status.progress.currentLessonId !== nextLessonId
          )
            commit({
              ...status.progress,
              currentLessonId: nextLessonId,
              lastOpenedAt: new Date().toISOString(),
            });
          const href = `/read/${encodeURIComponent(packageId)}/${encodeURIComponent(nextLessonId)}`;
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            setOfflineLessonId(nextLessonId);
            window.history.pushState({}, "", href);
          } else {
            setOfflineLessonId(undefined);
            router.push(href);
          }
        }
      }}
    />
  );
}
