"use client";

import {
  acceptValidation,
  addActivity,
  addChapter,
  addDraftAssets,
  addLesson,
  addQuestion,
  authoringLessons,
  draftAssetUsages,
  draftInput,
  duplicateActivity,
  duplicateChapter,
  duplicateLesson,
  duplicateQuestion,
  fileText,
  migrateDraft,
  moveActivity,
  moveChapter,
  moveLesson,
  regenerateFromPackage,
  replaceDraftAsset,
  removeActivity,
  removeChapter,
  removeLesson,
  removeQuestion,
  slug,
  updateActivity,
  updateChapter,
  updateLesson,
  updatePackageMetadata,
  updateQuestion,
  updateSourceText,
  withValidation,
  type AuthoringActivity,
  type AuthoringLesson,
  type AuthoringPackage,
  type AuthoringQuestion,
  type AuthoringQuestionType,
} from "@theoria/authoring";
import {
  WorkerMcfEngine,
  type EngineOperation,
  type EngineProgress,
  type EngineResult,
} from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import {
  type CompilationRecord,
  type PackageDraft,
  type ValidationDiagnostic,
} from "@theoria/package-model";
import { localPackageId } from "@theoria/reader";
import { Button, Status } from "@theoria/ui";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useAuth } from "./auth-provider";
import { StudioPublishingPanel } from "./studio-publishing-panel";
import { SyncStatus } from "./sync-status";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

const download = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const resultMessage = (result: EngineResult): string =>
  result.status === "error"
    ? result.diagnostics.map((item) => item.message).join(" ")
    : result.status === "unsupported"
      ? result.reason
      : result.status === "cancelled"
        ? "Operation cancelled."
        : "";

const questionTypes: readonly AuthoringQuestionType[] = [
  "multiple_choice",
  "multiple_select",
  "true_false",
  "short_answer",
  "numeric",
  "matching",
  "ordering",
  "essay",
  "open_response",
];

function Diagnostics({
  diagnostics,
  progress,
  onOpen,
  onCancel,
}: {
  readonly diagnostics: readonly ValidationDiagnostic[];
  readonly progress: EngineProgress | undefined;
  readonly onOpen: (path: string, line?: number) => void;
  readonly onCancel: () => void;
}) {
  const groups = ["error", "warning", "info"] as const;
  return (
    <aside className="validation-rail" aria-label="Validation results">
      <p className="section-label">Validation</p>
      {progress ? (
        <div className="validation-progress" role="status">
          <strong>{progress.message}</strong>
          <progress value={progress.completed} max={progress.total ?? 100} />
          <Button className="button-secondary" onClick={onCancel}>
            Cancel validation
          </Button>
        </div>
      ) : null}
      {diagnostics.length ? (
        groups.map((severity) => {
          const items = diagnostics.filter(
            (item) => item.severity === severity,
          );
          return items.length ? (
            <section key={severity}>
              <h2>
                {severity} · {items.length}
              </h2>
              {items.map((item, index) => (
                <button
                  className="studio-diagnostic"
                  key={`${item.code}-${index}`}
                  onClick={() => onOpen(item.file, item.line)}
                >
                  <code>{item.code}</code>
                  <span>
                    {item.file}
                    {item.line ? `:${item.line}:${item.column ?? 1}` : ""}
                  </span>
                  <strong>{item.message}</strong>
                </button>
              ))}
            </section>
          ) : null;
        })
      ) : (
        <div className="validation-empty">
          <span aria-hidden="true">◇</span>
          <strong>No diagnostics</strong>
          <p>Real worker validation results appear here.</p>
        </div>
      )}
    </aside>
  );
}

function MetadataEditor({
  pkg,
  onChange,
}: {
  readonly pkg: AuthoringPackage;
  readonly onChange: (pkg: AuthoringPackage, label: string) => void;
}) {
  const set = (patch: Record<string, unknown>, label: string) =>
    onChange(updatePackageMetadata(pkg, patch), label);
  const authors = (pkg.authors ?? []).join(", ");
  return (
    <section className="studio-form" aria-labelledby="metadata-heading">
      <header>
        <p className="section-label">Manifest</p>
        <h2 id="metadata-heading">Package metadata</h2>
      </header>
      <label className="field">
        <span>Title</span>
        <input
          value={pkg.title}
          onChange={(event) => set({ title: event.target.value }, "Edit title")}
        />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          rows={4}
          value={pkg.description ?? ""}
          onChange={(event) =>
            set({ description: event.target.value }, "Edit description")
          }
        />
      </label>
      <div className="form-columns">
        <label className="field">
          <span>Language</span>
          <input
            value={pkg.language}
            onChange={(event) =>
              set({ language: event.target.value }, "Edit language")
            }
          />
        </label>
        <label className="field">
          <span>Version</span>
          <input
            value={pkg.version ?? ""}
            onChange={(event) =>
              set({ version: event.target.value }, "Edit version")
            }
          />
        </label>
        <label className="field">
          <span>License</span>
          <input
            value={pkg.license ?? ""}
            onChange={(event) =>
              set({ license: event.target.value }, "Edit license")
            }
          />
        </label>
      </div>
      <label className="field">
        <span>Authors and contributors</span>
        <input
          value={authors}
          onChange={(event) =>
            set(
              {
                authors: event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              },
              "Edit authors",
            )
          }
        />
        <small>
          Comma-separated names. Contributor roles remain available in Source.
        </small>
      </label>
      <div className="form-columns">
        <label className="field">
          <span>Subjects</span>
          <input
            value={((pkg.subjects as string[] | undefined) ?? []).join(", ")}
            onChange={(event) =>
              set(
                {
                  subjects: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                },
                "Edit subjects",
              )
            }
          />
        </label>
        <label className="field">
          <span>Keywords</span>
          <input
            value={((pkg.keywords as string[] | undefined) ?? []).join(", ")}
            onChange={(event) =>
              set(
                {
                  keywords: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                },
                "Edit keywords",
              )
            }
          />
        </label>
        <label className="field">
          <span>Duration</span>
          <input
            placeholder="PT45M"
            value={String(pkg.estimated_duration ?? "")}
            onChange={(event) =>
              set({ estimated_duration: event.target.value }, "Edit duration")
            }
          />
        </label>
      </div>
      <details className="advanced-fields">
        <summary>Advanced metadata</summary>
        <p>
          Learning outcomes, prerequisites, level, curriculum identifiers,
          accessibility declarations, relationships, and extensions remain
          losslessly editable in Source. Existing values are preserved by visual
          regeneration.
        </p>
        <pre>
          {JSON.stringify(
            {
              level: pkg.level,
              prerequisites: pkg.prerequisites,
              learning_outcomes: pkg.learning_outcomes,
              relationships: pkg.relationships,
              accessibility: pkg.accessibility,
              extensions: pkg.extensions,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}

function CompletionJsonEditor({
  value,
  onApply,
}: {
  readonly value: unknown;
  readonly onApply: (value: NonNullable<AuthoringLesson["completion"]>) => void;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [buffer, setBuffer] = useState(serialized);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setBuffer(serialized), [serialized]);
  return (
    <details className="advanced-fields">
      <summary>Completion rules</summary>
      <label className="field">
        <span>Nested all/any completion expression (JSON)</span>
        <textarea
          rows={8}
          value={buffer}
          aria-invalid={invalid}
          onChange={(event) => setBuffer(event.target.value)}
          onBlur={() => {
            try {
              onApply(JSON.parse(buffer));
              setInvalid(false);
            } catch {
              setInvalid(true);
            }
          }}
        />
      </label>
    </details>
  );
}

function ContentEditor({
  pkg,
  chapterId,
  lessonId,
  activityId,
  onChange,
}: {
  readonly pkg: AuthoringPackage;
  readonly chapterId: string | undefined;
  readonly lessonId: string;
  readonly activityId: string | undefined;
  readonly onChange: (
    pkg: AuthoringPackage,
    label: string,
    selection?: {
      chapterId?: string | undefined;
      lessonId?: string | undefined;
      activityId?: string | undefined;
    },
  ) => void;
}) {
  const lessons = authoringLessons(pkg);
  const chapter =
    pkg.kind === "course"
      ? (pkg.chapters.find((item) => item.id === chapterId) ??
        pkg.chapters.find((item) =>
          item.lessons.some((child) => child.id === lessonId),
        ) ??
        pkg.chapters[0])
      : undefined;
  const lesson = lessons.find((item) => item.id === lessonId) ?? lessons[0];
  const activity =
    lesson?.activities.find((item) => item.id === activityId) ??
    lesson?.activities[0];
  if (!lesson) return <p>No learner-renderable lessons are available.</p>;
  const mutateLesson = (patch: Partial<typeof lesson>, label: string) =>
    onChange(
      updateLesson(pkg, lesson.id, (value) => ({ ...value, ...patch })),
      label,
    );
  const mutateActivity = (patch: Partial<AuthoringActivity>, label: string) => {
    if (!activity) return;
    onChange(
      updateActivity(pkg, lesson.id, activity.id, (value) => ({
        ...value,
        ...patch,
      })),
      label,
    );
  };
  return (
    <section className="studio-form">
      <header>
        <p className="section-label">Content</p>
        <h2>{lesson.title}</h2>
      </header>
      {pkg.kind === "course" && chapter ? (
        <div className="chapter-editor">
          <nav className="studio-inline-actions" aria-label="Course chapters">
            {pkg.chapters.map((item) => (
              <button
                className="button-secondary"
                key={item.id}
                draggable
                aria-current={item.id === chapter.id ? "true" : undefined}
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    "application/x-theoria-chapter",
                    item.id,
                  )
                }
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragged = event.dataTransfer.getData(
                    "application/x-theoria-chapter",
                  );
                  let from = pkg.chapters.findIndex(
                    (entry) => entry.id === dragged,
                  );
                  const target = pkg.chapters.findIndex(
                    (entry) => entry.id === item.id,
                  );
                  let next: AuthoringPackage = pkg;
                  while (from >= 0 && target >= 0 && from !== target) {
                    const direction = from < target ? 1 : -1;
                    next = moveChapter(next, dragged, direction);
                    from += direction;
                  }
                  if (dragged && next !== pkg)
                    onChange(next, "Drag reorder chapter");
                }}
                onClick={() =>
                  onChange(pkg, "Select chapter", {
                    chapterId: item.id,
                    lessonId: item.lessons[0]?.id,
                    activityId: item.lessons[0]?.activities[0]?.id,
                  })
                }
              >
                {item.title}
              </button>
            ))}
          </nav>
          <div className="form-columns">
            <label className="field">
              <span>Chapter title</span>
              <input
                value={chapter.title}
                onChange={(event) =>
                  onChange(
                    updateChapter(pkg, chapter.id, (value) => ({
                      ...value,
                      title: event.target.value,
                    })),
                    "Rename chapter",
                  )
                }
              />
            </label>
            <label className="field">
              <span>Stable chapter ID</span>
              <input value={chapter.id} readOnly />
            </label>
          </div>
          <div className="studio-inline-actions">
            <Button
              className="button-secondary"
              onClick={() => {
                const added = addChapter(pkg);
                onChange(added.package, "Add chapter", {
                  chapterId: added.chapterId,
                });
              }}
            >
              Add chapter
            </Button>
            <Button
              className="button-secondary"
              onClick={() => {
                const copy = duplicateChapter(pkg, chapter.id);
                onChange(copy.package, "Duplicate chapter", {
                  chapterId: copy.chapterId,
                });
              }}
            >
              Duplicate chapter
            </Button>
            <Button
              className="button-secondary"
              aria-label="Move chapter up"
              onClick={() =>
                onChange(moveChapter(pkg, chapter.id, -1), "Move chapter")
              }
            >
              ↑
            </Button>
            <Button
              className="button-secondary"
              aria-label="Move chapter down"
              onClick={() =>
                onChange(moveChapter(pkg, chapter.id, 1), "Move chapter")
              }
            >
              ↓
            </Button>
            <Button
              className="button-danger"
              onClick={() => {
                if (
                  confirm(`Delete chapter “${chapter.title}” and its lessons?`)
                )
                  onChange(removeChapter(pkg, chapter.id), "Delete chapter");
              }}
            >
              Delete chapter
            </Button>
          </div>
        </div>
      ) : null}
      <div className="form-columns">
        <label className="field">
          <span>Lesson title</span>
          <input
            value={lesson.title}
            onChange={(event) =>
              mutateLesson({ title: event.target.value }, "Rename lesson")
            }
          />
        </label>
        <label className="field">
          <span>Stable lesson ID</span>
          <input value={lesson.id} readOnly />
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <textarea
          rows={2}
          value={lesson.description ?? ""}
          onChange={(event) =>
            mutateLesson(
              { description: event.target.value },
              "Edit lesson description",
            )
          }
        />
      </label>
      <CompletionJsonEditor
        value={lesson.completion ?? {}}
        onApply={(completion) =>
          mutateLesson({ completion }, "Edit lesson completion rules")
        }
      />
      <div className="studio-inline-actions">
        {pkg.kind !== "lesson" ? (
          <>
            <Button
              className="button-secondary"
              onClick={() => {
                const added = addLesson(pkg, "New lesson", chapter?.id);
                onChange(added.package, "Add lesson", {
                  lessonId: added.lessonId,
                });
              }}
            >
              Add lesson
            </Button>
            <Button
              className="button-secondary"
              onClick={() => {
                const added = duplicateLesson(pkg, lesson.id);
                onChange(added.package, "Duplicate lesson", {
                  lessonId: added.lessonId,
                });
              }}
            >
              Duplicate
            </Button>
            <Button
              className="button-secondary"
              aria-label="Move lesson up"
              onClick={() =>
                onChange(moveLesson(pkg, lesson.id, -1), "Move lesson")
              }
            >
              ↑
            </Button>
            <Button
              className="button-secondary"
              aria-label="Move lesson down"
              onClick={() =>
                onChange(moveLesson(pkg, lesson.id, 1), "Move lesson")
              }
            >
              ↓
            </Button>
            <Button
              className="button-danger"
              onClick={() => {
                if (confirm(`Delete lesson “${lesson.title}”?`))
                  onChange(removeLesson(pkg, lesson.id), "Delete lesson", {
                    lessonId: lessons.find((item) => item.id !== lesson.id)?.id,
                  });
              }}
            >
              Delete lesson
            </Button>
          </>
        ) : null}
      </div>
      <hr />
      {activity ? (
        <>
          <div className="form-columns">
            <label className="field">
              <span>Activity title</span>
              <input
                value={activity.title ?? ""}
                onChange={(event) =>
                  mutateActivity(
                    { title: event.target.value },
                    "Edit activity title",
                  )
                }
              />
            </label>
            <label className="field">
              <span>Activity type</span>
              <select
                value={activity.type}
                onChange={(event) =>
                  mutateActivity(
                    { type: event.target.value as AuthoringActivity["type"] },
                    "Change activity type",
                  )
                }
              >
                <option value="notes">Notes</option>
                <option value="practice">Practice</option>
                <option value="assessment">Assessment</option>
                <option value="assignment">Assignment</option>
              </select>
            </label>
            <label className="field">
              <span>Evaluation</span>
              <select
                value={activity.evaluation ?? "automatic"}
                onChange={(event) =>
                  mutateActivity(
                    {
                      evaluation: event.target.value as NonNullable<
                        AuthoringActivity["evaluation"]
                      >,
                    },
                    "Change evaluation",
                  )
                }
              >
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
                <option value="completion">Completion</option>
                <option value="ungraded">Ungraded</option>
              </select>
            </label>
          </div>
          {activity.type === "assessment" ? (
            <label className="field">
              <span>Passing score</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={activity.passing_score ?? 0.7}
                onChange={(event) =>
                  mutateActivity(
                    { passing_score: Number(event.target.value) },
                    "Edit passing score",
                  )
                }
              />
            </label>
          ) : null}
          {activity.type === "assignment" ? (
            <div className="form-columns">
              <label className="field">
                <span>Submission modes</span>
                <input
                  value={(activity.submission?.modes ?? []).join(", ")}
                  onChange={(event) =>
                    mutateActivity(
                      {
                        submission: {
                          ...(activity.submission ?? { modes: [] }),
                          modes: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter((item) =>
                              ["text", "file", "url"].includes(item),
                            ) as ("text" | "file" | "url")[],
                        },
                      },
                      "Edit submission modes",
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Accepted media types</span>
                <input
                  value={
                    activity.submission?.accepted_media_types?.join(", ") ?? ""
                  }
                  onChange={(event) =>
                    mutateActivity(
                      {
                        submission: {
                          ...(activity.submission ?? { modes: ["text"] }),
                          accepted_media_types: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        },
                      },
                      "Edit accepted media",
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Rubric ID</span>
                <input
                  value={activity.rubric ?? ""}
                  onChange={(event) =>
                    mutateActivity(
                      { rubric: event.target.value },
                      "Link assignment rubric",
                    )
                  }
                />
              </label>
            </div>
          ) : null}
          <label className="field">
            <span>CommonMark content</span>
            <textarea
              className="markdown-editor"
              rows={18}
              value={activity.content}
              onChange={(event) =>
                mutateActivity(
                  { content: event.target.value },
                  "Edit activity Markdown",
                )
              }
            />
            <small>
              Fenced code, tables, links, math, and asset references are
              preserved literally.
            </small>
          </label>
          <div className="studio-inline-actions">
            {(["notes", "practice", "assessment", "assignment"] as const).map(
              (type) => (
                <Button
                  className="button-secondary"
                  key={type}
                  onClick={() => {
                    const added = addActivity(pkg, lesson.id, type);
                    onChange(added.package, `Add ${type}`, {
                      lessonId: lesson.id,
                      activityId: added.activityId,
                    });
                  }}
                >
                  + {type}
                </Button>
              ),
            )}
            <Button
              className="button-secondary"
              onClick={() => {
                const copy = duplicateActivity(pkg, lesson.id, activity.id);
                onChange(copy.package, "Duplicate activity", {
                  activityId: copy.activityId,
                });
              }}
            >
              Duplicate activity
            </Button>
            <Button
              className="button-secondary"
              aria-label="Move activity up"
              onClick={() =>
                onChange(
                  moveActivity(pkg, lesson.id, activity.id, -1),
                  "Move activity",
                )
              }
            >
              ↑
            </Button>
            <Button
              className="button-secondary"
              aria-label="Move activity down"
              onClick={() =>
                onChange(
                  moveActivity(pkg, lesson.id, activity.id, 1),
                  "Move activity",
                )
              }
            >
              ↓
            </Button>
            <Button
              className="button-danger"
              onClick={() => {
                if (
                  confirm(`Delete activity “${activity.title ?? activity.id}”?`)
                )
                  onChange(
                    removeActivity(pkg, lesson.id, activity.id),
                    "Delete activity",
                  );
              }}
            >
              Delete activity
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function QuestionEditor({
  pkg,
  lessonId,
  activityId,
  questionId,
  onChange,
}: {
  readonly pkg: AuthoringPackage;
  readonly lessonId: string;
  readonly activityId: string | undefined;
  readonly questionId: string | undefined;
  readonly onChange: (
    pkg: AuthoringPackage,
    label: string,
    selection?: { questionId?: string; activityId?: string },
  ) => void;
}) {
  const lesson = authoringLessons(pkg).find((item) => item.id === lessonId);
  const selectedActivity = lesson?.activities.find(
    (item) => item.id === activityId,
  );
  const activity =
    selectedActivity?.type === "notes"
      ? lesson?.activities.find((item) => item.type !== "notes")
      : (selectedActivity ??
        lesson?.activities.find((item) => item.type !== "notes"));
  const question =
    activity?.questions.find((item) => item.id === questionId) ??
    activity?.questions[0];
  const mutate = (patch: Partial<AuthoringQuestion>, label: string) => {
    if (!activity || !question) return;
    onChange(
      updateQuestion(
        pkg,
        lessonId,
        activity.id,
        question.id,
        (value) => ({ ...value, ...patch }) as AuthoringQuestion,
      ),
      label,
    );
  };
  return (
    <section className="studio-form">
      <header>
        <p className="section-label">Question builder</p>
        <h2>{question?.prompt ?? "Add a question"}</h2>
      </header>
      <div className="question-type-grid">
        {questionTypes.map((type) => (
          <Button
            className="button-secondary"
            key={type}
            disabled={!activity}
            onClick={() => {
              if (!activity) return;
              const added = addQuestion(pkg, lessonId, activity.id, type);
              onChange(added.package, `Add ${type} question`, {
                activityId: activity.id,
                questionId: added.questionId,
              });
            }}
          >
            + {type.replaceAll("_", " ")}
          </Button>
        ))}
      </div>
      {!activity ? (
        <p>
          Add or select a practice, assessment, or assignment activity first.
        </p>
      ) : question ? (
        <>
          <div className="form-columns">
            <label className="field">
              <span>Type</span>
              <input value={question.type} readOnly />
            </label>
            <label className="field">
              <span>Points</span>
              <input
                type="number"
                min="0"
                step="0.25"
                value={question.points}
                onChange={(event) =>
                  mutate({ points: Number(event.target.value) }, "Edit points")
                }
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(event) =>
                  mutate({ required: event.target.checked }, "Toggle required")
                }
              />
              Required
            </label>
          </div>
          <label className="field">
            <span>Prompt</span>
            <textarea
              rows={4}
              value={question.prompt}
              onChange={(event) =>
                mutate({ prompt: event.target.value }, "Edit prompt")
              }
            />
          </label>
          <QuestionSemanticsEditor question={question} onApply={mutate} />
          <div className="form-columns">
            <label className="field">
              <span>Hint</span>
              <textarea
                value={question.hint ?? ""}
                onChange={(event) =>
                  mutate({ hint: event.target.value }, "Edit hint")
                }
              />
            </label>
            <label className="field">
              <span>Explanation / targeted feedback</span>
              <textarea
                value={question.explanation ?? ""}
                onChange={(event) =>
                  mutate(
                    { explanation: event.target.value },
                    "Edit explanation",
                  )
                }
              />
            </label>
          </div>
          <div className="studio-inline-actions">
            <Button
              className="button-secondary"
              onClick={() => {
                const copy = duplicateQuestion(
                  pkg,
                  lessonId,
                  activity.id,
                  question.id,
                );
                onChange(copy.package, "Duplicate question", {
                  questionId: copy.questionId,
                });
              }}
            >
              Duplicate question
            </Button>
            <Button
              className="button-danger"
              onClick={() => {
                if (confirm(`Delete question “${question.id}”?`))
                  onChange(
                    removeQuestion(pkg, lessonId, activity.id, question.id),
                    "Delete question",
                  );
              }}
            >
              Delete question
            </Button>
          </div>
        </>
      ) : (
        <p>This activity has no questions yet.</p>
      )}
      <RubricJsonEditor
        value={pkg.rubrics ?? []}
        onApply={(rubrics) =>
          onChange(
            updatePackageMetadata(pkg, { rubrics }),
            "Edit package rubrics",
          )
        }
      />
    </section>
  );
}

function RubricJsonEditor({
  value,
  onApply,
}: {
  readonly value: unknown;
  readonly onApply: (value: unknown) => void;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [buffer, setBuffer] = useState(serialized);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setBuffer(serialized), [serialized]);
  return (
    <details className="advanced-fields">
      <summary>Rubrics: criteria, levels, and points</summary>
      <label className="field">
        <span>Package rubrics (JSON)</span>
        <textarea
          rows={12}
          value={buffer}
          aria-invalid={invalid}
          onChange={(event) => setBuffer(event.target.value)}
          onBlur={() => {
            try {
              onApply(JSON.parse(buffer));
              setInvalid(false);
            } catch {
              setInvalid(true);
            }
          }}
        />
        <small>
          Rubric IDs can be referenced from assignments and manual questions.
          Valid JSON is applied on blur and then validated as MCF.
        </small>
      </label>
    </details>
  );
}

function QuestionSemanticsEditor({
  question,
  onApply,
}: {
  readonly question: AuthoringQuestion;
  readonly onApply: (patch: Partial<AuthoringQuestion>, label: string) => void;
}) {
  const value = JSON.stringify(
    {
      answer: question.answer,
      answers: question.answers,
      options: question.options,
      premises: question.premises,
      responses: question.responses,
      items: question.items,
      tolerance: question.tolerance,
      unit: question.unit,
      normalization: question.normalization,
      scoring: question.scoring,
      reuse_responses: question.reuse_responses,
      minimum_words: question.minimum_words,
      minimum_sentences: question.minimum_sentences,
      keywords: question.keywords,
      minimum_keywords: question.minimum_keywords,
      evaluation: question.evaluation,
      rubric: question.rubric,
    },
    null,
    2,
  );
  const [buffer, setBuffer] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setBuffer(value);
    setInvalid(false);
  }, [question.id, value]);
  return (
    <label className="field">
      <span>Answer and type-specific fields (JSON)</span>
      <textarea
        rows={10}
        value={buffer}
        aria-invalid={invalid}
        onChange={(event) => {
          setBuffer(event.target.value);
          setInvalid(false);
        }}
        onBlur={() => {
          try {
            onApply(JSON.parse(buffer), "Edit question semantics");
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
      <small>
        Options accept weights and selected-option feedback. Matching, ordering,
        normalization, partial scoring, tolerances, and response reuse use their
        MCF field names. Valid JSON is applied when focus leaves this field.
      </small>
      {invalid ? (
        <strong role="alert">Fix the JSON before leaving this field.</strong>
      ) : null}
    </label>
  );
}

export function StudioDraftWorkspace({
  draftId,
}: {
  readonly draftId: string;
}) {
  const { identity } = useAuth();
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const [draft, setDraft] = useState<PackageDraft>();
  const [saveState, setSaveState] = useState<
    "loading" | "saved" | "saving" | "error"
  >("loading");
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<EngineProgress>();
  const [sourcePath, setSourcePath] = useState("manifest.yaml");
  const [sourceBuffer, setSourceBuffer] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetMessage, setAssetMessage] = useState<string>();
  const validationRequest = useRef<string | undefined>(undefined);

  useEffect(() => {
    void engine.initialize();
    if (!store) {
      setError("IndexedDB is unavailable or blocked.");
      setSaveState("error");
      return;
    }
    void store.drafts.get(draftId as PackageDraft["id"]).then((value) => {
      const migrated = migrateDraft(value);
      if (!migrated)
        setError("This draft is missing or uses an unsupported schema.");
      else {
        setDraft(migrated);
        const selected =
          migrated.sourceFiles.find(
            (file) => file.path === migrated.editor.selectedPath,
          ) ?? migrated.sourceFiles.find((file) => file.kind === "text");
        if (selected) {
          setSourcePath(selected.path);
          setSourceBuffer(fileText(selected));
        }
        setSaveState("saved");
      }
    });
    return () => engine.dispose();
  }, [draftId, engine]);

  useEffect(() => {
    if (!draft || !store || saveState === "loading") return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      void store.drafts
        .put(draft)
        .then(() => setSaveState("saved"))
        .catch((reason) => {
          setSaveState("error");
          setError(
            reason instanceof DOMException &&
              reason.name === "QuotaExceededError"
              ? "Browser storage quota was exceeded. Export and remove unused drafts."
              : reason instanceof Error
                ? reason.message
                : "Autosave failed.",
          );
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [draft]);

  const execute = useCallback(
    async (operation: EngineOperation, current: PackageDraft) => {
      const ready = await engine.initialize();
      if (ready.status !== "ready")
        throw new Error("The browser MCF worker is unavailable.");
      const requestId = crypto.randomUUID();
      validationRequest.current = requestId;
      setProgress({
        requestId,
        operation,
        phase: "importing",
        completed: 0,
        total: 100,
        message: "Starting validation",
      });
      const result = await engine.execute(
        {
          type: "request",
          requestId,
          operation,
          input: draftInput(current),
        },
        setProgress,
      );
      setProgress(undefined);
      return result;
    },
    [engine],
  );

  useEffect(() => {
    if (!draft || draft.validation.state !== "unchecked") return;
    const timer = setTimeout(() => {
      void execute("validate", draft).then((result) => {
        if (result.status === "ok")
          setDraft((value) => value && acceptValidation(value, result));
        else if (result.status === "error")
          setDraft(
            (value) =>
              value &&
              withValidation(value, {
                state: "invalid",
                diagnostics: result.diagnostics,
                checkedAt: new Date().toISOString(),
              }),
          );
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [draft, execute]);

  const setEditor = (patch: Partial<PackageDraft["editor"]>) =>
    setDraft((value) =>
      value
        ? {
            ...value,
            editor: { ...value.editor, ...patch },
            updatedAt: new Date().toISOString(),
          }
        : value,
    );

  const visualChange = (
    pkg: AuthoringPackage,
    label: string,
    selection?: {
      chapterId?: string | undefined;
      lessonId?: string | undefined;
      activityId?: string | undefined;
      questionId?: string | undefined;
    },
  ) => {
    if (!draft) return;
    try {
      const next = regenerateFromPackage(draft, pkg, label);
      setDraft({
        ...next,
        editor: {
          ...next.editor,
          ...(selection?.lessonId
            ? { selectedLessonId: selection.lessonId }
            : {}),
          ...(selection?.chapterId
            ? { selectedChapterId: selection.chapterId }
            : {}),
          ...(selection?.activityId
            ? { selectedActivityId: selection.activityId }
            : {}),
          ...(selection?.questionId
            ? { selectedQuestionId: selection.questionId }
            : {}),
        },
      });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Visual edit failed.",
      );
    }
  };

  if (error && !draft)
    return (
      <div className="reader-error" role="alert">
        <h1>Draft unavailable</h1>
        <p>{error}</p>
        <Link className="button" href="/studio">
          Return to Studio
        </Link>
      </div>
    );
  if (!draft)
    return (
      <div className="reader-loading" aria-busy="true">
        <h1>Opening draft…</h1>
      </div>
    );

  const pkg = draft.normalizedPackage as AuthoringPackage | undefined;
  const lessons = pkg ? authoringLessons(pkg) : [];
  const lessonId =
    lessons.find((item) => item.id === draft.editor.selectedLessonId)?.id ??
    lessons[0]?.id ??
    "";
  const chapterId =
    pkg?.kind === "course"
      ? (pkg.chapters.find((item) => item.id === draft.editor.selectedChapterId)
          ?.id ??
        pkg.chapters.find((item) =>
          item.lessons.some((child) => child.id === lessonId),
        )?.id ??
        pkg.chapters[0]?.id)
      : undefined;
  const lesson = lessons.find((item) => item.id === lessonId);
  const activityId =
    lesson?.activities.find(
      (item) => item.id === draft.editor.selectedActivityId,
    )?.id ?? lesson?.activities[0]?.id;
  const activeFile =
    draft.sourceFiles.find((file) => file.path === sourcePath) ??
    draft.sourceFiles.find((file) => file.kind === "text");

  const changeSection = (section: PackageDraft["editor"]["section"]) => {
    if (sourceDirty && draft.editor.section === "source") {
      const discard = confirm(
        "The source buffer has unapplied changes. Discard them and switch panels?",
      );
      if (!discard) return;
      setSourceDirty(false);
      if (activeFile) setSourceBuffer(fileText(activeFile));
    }
    setEditor({ section });
  };

  const validateNow = async () => {
    const result = await execute("validate", draft);
    if (result.status === "ok") setDraft(acceptValidation(draft, result));
    else if (result.status === "error")
      setDraft(
        withValidation(draft, {
          state: "invalid",
          diagnostics: result.diagnostics,
          checkedAt: new Date().toISOString(),
        }),
      );
    else setError(resultMessage(result));
  };

  const claimDraft = () => {
    if (!identity) return;
    const at = new Date().toISOString();
    const claimed: PackageDraft = {
      ...draft,
      owner: {
        type: "user",
        userId: identity.id,
        claimedAt: at,
      },
      revision: draft.revision + 1,
      updatedAt: at,
      commands: [
        ...draft.commands.slice(-49),
        {
          id: crypto.randomUUID(),
          label: `Claim for @${identity.profile.handle}`,
          at,
          revision: draft.revision + 1,
        },
      ],
    };
    if (!store) {
      setDraft(claimed);
      return;
    }
    setSaveState("saving");
    void store.drafts
      .put(claimed)
      .then(() => {
        setDraft(claimed);
        setSaveState("saved");
      })
      .catch((reason) => {
        setSaveState("error");
        setError(
          reason instanceof Error
            ? reason.message
            : "The local draft could not be claimed.",
        );
      });
  };

  const compile = async (openPreview: boolean) => {
    if (!store) return;
    const result = await execute("compile", draft);
    if (result.status !== "ok" || !result.compiledArtifact) {
      setError(
        resultMessage(result) || "Compilation did not produce an artifact.",
      );
      return;
    }
    const at = new Date().toISOString();
    const compilationId = crypto.randomUUID();
    const record: CompilationRecord = {
      id: compilationId,
      sourceFilename: `${slug(draft.title)}.mcf.zip`,
      identity: {
        id: result.summary.manifest.id,
        title: result.summary.manifest.title,
        version: result.summary.manifest.version,
      },
      packageKind: result.summary.manifest.kind,
      mcfVersion: result.summary.manifest.mcf,
      sourceChecksum: result.summary.sourceChecksum,
      sourceArchive: new Blob([result.sourceArchive], {
        type: "application/zip",
      }),
      compiledArtifact: new Blob([result.compiledArtifact], {
        type: "application/zip",
      }),
      validation: result.validation,
      diagnostics: result.diagnostics,
      createdAt: at,
      updatedAt: at,
      syncState: "local",
      ...(draft.owner ? { owner: draft.owner } : {}),
    };
    await store.compilations.put(record);
    const localId = localPackageId(
      result.summary.manifest.id,
      result.summary.manifest.version,
      result.summary.sourceChecksum,
    );
    await store.library.put({
      packageId: localId,
      title: result.summary.manifest.title,
      packageKind: result.summary.manifest.kind,
      mcfVersion: result.summary.manifest.mcf,
      version: result.summary.manifest.version,
      addedAt: at,
      origin: "authored",
      ...(draft.owner ? { owner: draft.owner } : {}),
      source: { type: "compilation", compilationId },
    });
    setDraft({
      ...acceptValidation(draft, result),
      latestCompilationId: compilationId,
    });
    if (openPreview) setPreviewUrl(`/preview/${encodeURIComponent(localId)}`);
    else download(record.compiledArtifact, `${slug(draft.title)}-compiled.zip`);
  };

  const exportSource = async () => {
    const result = await execute("validate", draft);
    if (result.status === "ok")
      download(
        new Blob([result.sourceArchive], { type: "application/zip" }),
        `${slug(draft.title)}.mcf.zip`,
      );
    else setError("Resolve validation errors before exporting source.");
  };

  const openDiagnostic = (path: string, line?: number) => {
    const file = draft.sourceFiles.find((item) => item.path === path);
    if (!file || file.kind !== "text") return;
    if (sourceDirty && !confirm("Discard the unapplied source buffer?")) return;
    setSourcePath(path);
    setSourceBuffer(fileText(file));
    setSourceDirty(false);
    setEditor({ section: "source", selectedPath: path });
    requestAnimationFrame(() => {
      const textarea =
        document.querySelector<HTMLTextAreaElement>("#source-editor");
      if (!textarea || !line) return;
      const lines = textarea.value.split("\n");
      const start = lines.slice(0, Math.max(0, line - 1)).join("\n").length;
      textarea.focus();
      textarea.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    });
  };

  const uploadAssets = async (selected: File[]) => {
    if (!pkg || selected.length === 0 || assetBusy) return;
    setAssetBusy(true);
    setAssetMessage(undefined);
    setError(undefined);
    try {
      const next = await addDraftAssets(
        draft,
        pkg,
        await Promise.all(
          selected.map(async (file) => ({
            name: file.name,
            type: file.type,
            bytes: await file.arrayBuffer(),
          })),
        ),
      );
      setDraft(next);
      setAssetMessage(
        `${selected.length} asset${selected.length === 1 ? "" : "s"} added without changing existing files.`,
      );
    } finally {
      setAssetBusy(false);
    }
  };

  const replaceAsset = async (assetId: string, file: File) => {
    if (!pkg || assetBusy) return;
    setAssetBusy(true);
    setAssetMessage(undefined);
    setError(undefined);
    try {
      setDraft(
        await replaceDraftAsset(draft, pkg, assetId, {
          name: file.name,
          type: file.type,
          bytes: await file.arrayBuffer(),
        }),
      );
      setAssetMessage(
        `Asset ${assetId} was replaced; its reference is unchanged.`,
      );
    } finally {
      setAssetBusy(false);
    }
  };

  return (
    <div className="creation-workspace">
      <aside className="draft-tree">
        <p className="section-label">Package tree</p>
        <strong>{draft.title}</strong>
        <p>
          {draft.kind} · MCF {draft.mcf}
        </p>
        {pkg ? (
          <nav aria-label="Package content tree">
            {lessons.map((item) => (
              <div key={item.id}>
                <button
                  draggable
                  aria-current={item.id === lessonId ? "true" : undefined}
                  onDragStart={(event) =>
                    event.dataTransfer.setData(
                      "application/x-theoria-lesson",
                      item.id,
                    )
                  }
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dragged = event.dataTransfer.getData(
                      "application/x-theoria-lesson",
                    );
                    if (pkg.kind === "course") {
                      const sourceChapter = pkg.chapters.find((chapter) =>
                        chapter.lessons.some((lesson) => lesson.id === dragged),
                      );
                      const targetChapter = pkg.chapters.find((chapter) =>
                        chapter.lessons.some((lesson) => lesson.id === item.id),
                      );
                      if (sourceChapter?.id !== targetChapter?.id) {
                        setError(
                          "Drag reordering stays within a chapter. Use the chapter controls to organize course sections.",
                        );
                        return;
                      }
                    }
                    const order = authoringLessons(pkg).map(
                      (lesson) => lesson.id,
                    );
                    let from = order.indexOf(dragged);
                    const target = order.indexOf(item.id);
                    let next = pkg;
                    while (from >= 0 && target >= 0 && from !== target) {
                      const direction = from < target ? 1 : -1;
                      next = moveLesson(next, dragged, direction);
                      from += direction;
                    }
                    if (dragged && next !== pkg)
                      visualChange(next, "Drag reorder lesson");
                  }}
                  onClick={() =>
                    setEditor({
                      section: "content",
                      selectedLessonId: item.id,
                      ...(item.activities[0]
                        ? { selectedActivityId: item.activities[0].id }
                        : {}),
                    })
                  }
                >
                  {item.title}
                </button>
                {item.id === lessonId
                  ? item.activities.map((activity) => (
                      <button
                        className="tree-child"
                        draggable
                        aria-current={
                          activity.id === activityId ? "true" : undefined
                        }
                        key={activity.id}
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/x-theoria-activity",
                            activity.id,
                          )
                        }
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const dragged = event.dataTransfer.getData(
                            "application/x-theoria-activity",
                          );
                          const order = item.activities.map(
                            (entry) => entry.id,
                          );
                          let from = order.indexOf(dragged);
                          const target = order.indexOf(activity.id);
                          let next = pkg;
                          while (from >= 0 && target >= 0 && from !== target) {
                            const direction = from < target ? 1 : -1;
                            next = moveActivity(
                              next,
                              item.id,
                              dragged,
                              direction,
                            );
                            from += direction;
                          }
                          if (dragged && next !== pkg)
                            visualChange(next, "Drag reorder activity");
                        }}
                        onClick={() =>
                          setEditor({
                            section: "content",
                            selectedActivityId: activity.id,
                          })
                        }
                      >
                        {activity.title ?? activity.type}
                      </button>
                    ))
                  : null}
              </div>
            ))}
          </nav>
        ) : null}
        <hr />
        <nav aria-label="Draft source files">
          {draft.sourceFiles.map((file) => (
            <button
              key={file.path}
              title={file.path}
              onClick={() => openDiagnostic(file.path)}
            >
              {file.path}
            </button>
          ))}
        </nav>
      </aside>

      <main className="creation-main">
        <header className="creation-toolbar">
          <nav aria-label="Studio panels">
            {(
              [
                "content",
                "questions",
                "assets",
                "metadata",
                "source",
                "preview",
                "publish",
              ] as const
            ).map((section) => (
              <button
                key={section}
                aria-current={
                  draft.editor.section === section ? "page" : undefined
                }
                onClick={() => changeSection(section)}
              >
                {section}
              </button>
            ))}
          </nav>
          <div className="actions">
            <span className="save-state" role="status">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved locally"
                  : saveState === "error"
                    ? "Save failed"
                    : "Opening…"}
            </span>
            <Status
              tone={
                draft.validation.state === "valid"
                  ? "positive"
                  : draft.validation.state === "invalid"
                    ? "warning"
                    : "neutral"
              }
            >
              {draft.validation.state}
            </Status>
            <SyncStatus category="draft" stableId={draft.id} />
            {identity ? (
              draft.owner?.userId === identity.id ? (
                <Status tone="positive">
                  Owned by @{identity.profile.handle}
                </Status>
              ) : draft.owner ? (
                <Status tone="warning">Claimed by another account</Status>
              ) : (
                <Button className="button-secondary" onClick={claimDraft}>
                  Claim local draft
                </Button>
              )
            ) : null}
            <Button
              className="button-secondary"
              onClick={() => void validateNow()}
            >
              Validate
            </Button>
            <Button onClick={() => void exportSource()}>Export source</Button>
          </div>
        </header>
        {error ? (
          <p className="studio-error" role="alert">
            {error} <button onClick={() => setError(undefined)}>Dismiss</button>
          </p>
        ) : null}
        {draft.visualEditing !== "supported" &&
        !["source", "preview", "publish"].includes(draft.editor.section) ? (
          <section className="source-boundary">
            <p className="section-label">Explicit round-trip boundary</p>
            <h2>
              {draft.visualEditing === "source-only"
                ? "This package is source-only."
                : "Imported source is preserved exactly."}
            </h2>
            <p>
              Visual regeneration can rewrite formatting and cannot represent
              referenced question-bank objects. Nothing will be overwritten
              until you explicitly continue.
            </p>
            {draft.visualEditing === "requires-regeneration" && pkg ? (
              <Button
                onClick={() => {
                  if (
                    confirm(
                      "Regenerate supported MCF files from the validated model? The original archive remains available for export.",
                    )
                  )
                    setDraft(
                      regenerateFromPackage(
                        draft,
                        pkg,
                        "Enable visual editing",
                      ),
                    );
                }}
              >
                Enable visual editing
              </Button>
            ) : (
              <Button onClick={() => changeSection("source")}>
                Open Source
              </Button>
            )}
          </section>
        ) : draft.editor.section === "metadata" && pkg ? (
          <MetadataEditor pkg={pkg} onChange={visualChange} />
        ) : draft.editor.section === "content" && pkg ? (
          <ContentEditor
            pkg={pkg}
            chapterId={chapterId}
            lessonId={lessonId}
            activityId={activityId}
            onChange={visualChange}
          />
        ) : draft.editor.section === "questions" && pkg ? (
          <QuestionEditor
            pkg={pkg}
            lessonId={lessonId}
            activityId={activityId}
            questionId={draft.editor.selectedQuestionId}
            onChange={visualChange}
          />
        ) : draft.editor.section === "assets" ? (
          <section className="studio-form">
            <header>
              <p className="section-label">Asset manager</p>
              <h2>Package assets</h2>
            </header>
            <label
              className="drop-zone compact"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files"))
                  event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                void uploadAssets([...event.dataTransfer.files]).catch(
                  (reason) =>
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Asset upload failed.",
                    ),
                );
              }}
            >
              <strong>Add local assets</strong>
              <span>
                Images, safe SVG, audio, video, documents, captions, and
                transcripts.
              </span>
              <input
                type="file"
                multiple
                disabled={assetBusy}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const selected = [...(event.target.files ?? [])];
                  event.target.value = "";
                  void uploadAssets(selected).catch((reason) =>
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Asset upload failed.",
                    ),
                  );
                }}
              />
            </label>
            {assetMessage ? (
              <p className="studio-success" role="status">
                {assetMessage}
              </p>
            ) : null}
            <div className="asset-grid">
              {(pkg?.assets ?? []).map((asset) => {
                const usages = draftAssetUsages(draft, asset, pkg);
                return (
                  <article key={asset.id}>
                    <strong>{asset.id}</strong>
                    <code>{asset.source}</code>
                    <div className="asset-metadata">
                      {(
                        [
                          ["alt", "Alternative text"],
                          ["caption", "Caption"],
                          ["transcript", "Transcript path"],
                          ["attribution", "Attribution"],
                          ["license", "License"],
                        ] as const
                      ).map(([field, label]) => (
                        <label className="field" key={field}>
                          <span>{label}</span>
                          <input
                            value={String(asset[field] ?? "")}
                            onChange={(event) => {
                              if (!pkg) return;
                              const nextPackage = structuredClone(pkg);
                              const target = (nextPackage.assets ?? []).find(
                                (item) => item.id === asset.id,
                              );
                              if (!target) return;
                              if (event.target.value)
                                target[field] = event.target.value;
                              else delete target[field];
                              visualChange(
                                nextPackage,
                                `Edit ${field} for ${asset.id}`,
                              );
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <p>
                      {usages.length
                        ? `Used in ${usages.join(", ")}`
                        : "No source references found."}
                    </p>
                    <Button
                      className="button-secondary"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          `![Describe ${asset.id}](asset:${asset.id})`,
                        )
                      }
                    >
                      Copy reference
                    </Button>
                    <label className="button button-secondary asset-replace">
                      {assetBusy ? "Working…" : "Replace file"}
                      <input
                        type="file"
                        disabled={assetBusy}
                        onChange={(event) => {
                          const replacement = event.target.files?.[0];
                          event.target.value = "";
                          if (replacement)
                            void replaceAsset(asset.id, replacement).catch(
                              (reason) =>
                                setError(
                                  reason instanceof Error
                                    ? reason.message
                                    : "Asset replacement failed.",
                                ),
                            );
                        }}
                      />
                    </label>
                    <Button
                      className="button-danger"
                      onClick={() => {
                        if (usages.length) {
                          setError(
                            `Remove references to ${asset.id} from ${usages.join(", ")} before deleting the asset.`,
                          );
                          return;
                        }
                        if (!pkg) return;
                        if (
                          !confirm(
                            `Delete asset “${asset.id}” from this draft?`,
                          )
                        )
                          return;
                        const nextPackage = Object.assign(
                          structuredClone(pkg),
                          {
                            assets: (pkg.assets ?? []).filter(
                              (item) => item.id !== asset.id,
                            ),
                          },
                        );
                        setDraft(
                          regenerateFromPackage(
                            {
                              ...draft,
                              sourceFiles: draft.sourceFiles.filter(
                                (file) => file.path !== asset.source,
                              ),
                            },
                            nextPackage,
                            "Remove asset",
                          ),
                        );
                      }}
                    >
                      Remove
                    </Button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : draft.editor.section === "source" ? (
          <section className="source-editor-panel">
            <header>
              <div>
                <p className="section-label">Direct MCF source</p>
                <h2>{sourcePath}</h2>
              </div>
              <div className="actions">
                <Status tone={sourceDirty ? "warning" : "positive"}>
                  {sourceDirty ? "Unapplied changes" : "Canonical source"}
                </Status>
                <Button
                  disabled={!sourceDirty}
                  onClick={() => {
                    const next = updateSourceText(
                      draft,
                      sourcePath,
                      sourceBuffer,
                    );
                    setDraft(next);
                    setSourceDirty(false);
                    void execute("validate", next).then((result) => {
                      if (result.status === "ok")
                        setDraft(
                          (value) => value && acceptValidation(value, result),
                        );
                      else if (result.status === "error")
                        setDraft(
                          (value) =>
                            value &&
                            withValidation(value, {
                              state: "invalid",
                              diagnostics: result.diagnostics,
                              checkedAt: new Date().toISOString(),
                            }),
                        );
                    });
                  }}
                >
                  Apply and validate
                </Button>
              </div>
            </header>
            {activeFile?.kind === "text" ? (
              <textarea
                id="source-editor"
                spellCheck={false}
                value={sourceBuffer}
                onChange={(event) => {
                  setSourceBuffer(event.target.value);
                  setSourceDirty(true);
                }}
              />
            ) : (
              <p>
                Binary assets are managed in Assets and cannot be edited as
                text.
              </p>
            )}
          </section>
        ) : draft.editor.section === "publish" ? (
          <StudioPublishingPanel
            draft={draft}
            identity={identity}
            validate={() => execute("validate", draft)}
            onClaim={claimDraft}
            onPublished={async (result, validation) => {
              const at = new Date().toISOString();
              const next = acceptValidation(draft, validation);
              const publishedDraft: PackageDraft = {
                ...next,
                publication: {
                  remotePackageId: result.packageId,
                  slug: result.slug,
                  lastPublishedVersion: result.version,
                  publishedChecksum: validation.summary.sourceChecksum,
                  publishedAt: result.publishedAt,
                },
                updatedAt: at,
                commands: [
                  ...next.commands.slice(-49),
                  {
                    id: crypto.randomUUID(),
                    label: `Publish ${result.version}`,
                    at,
                    revision: next.revision,
                  },
                ],
              };
              await store?.drafts.put(publishedDraft);
              setDraft(publishedDraft);
            }}
          />
        ) : draft.editor.section === "preview" ? (
          <section className="studio-preview">
            <header>
              <div>
                <p className="section-label">Real reader preview</p>
                <h2>Compiled current draft</h2>
              </div>
              <div className="actions">
                <Button
                  className="button-secondary"
                  onClick={() =>
                    setEditor({
                      previewSize:
                        draft.editor.previewSize === "desktop"
                          ? "mobile"
                          : "desktop",
                    })
                  }
                >
                  {draft.editor.previewSize === "desktop"
                    ? "Mobile size"
                    : "Desktop size"}
                </Button>
                <Button onClick={() => void compile(true)}>
                  Build preview
                </Button>
                <Button
                  className="button-secondary"
                  onClick={() => void compile(false)}
                >
                  Export compiled ZIP
                </Button>
                <Button
                  className="button-secondary"
                  onClick={() => changeSection("content")}
                >
                  Exit preview
                </Button>
              </div>
            </header>
            {previewUrl ? (
              <iframe
                className={draft.editor.previewSize}
                src={previewUrl}
                title="Theoria reader preview"
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
              />
            ) : (
              <div className="empty-state">
                <h2>No stale preview shown.</h2>
                <p>
                  Build the current source through the real compiler and reader.
                </p>
              </div>
            )}
          </section>
        ) : null}
      </main>

      <Diagnostics
        diagnostics={draft.validation.diagnostics}
        progress={progress}
        onOpen={openDiagnostic}
        onCancel={() => {
          if (validationRequest.current)
            engine.cancel(validationRequest.current);
          setProgress(undefined);
        }}
      />
    </div>
  );
}
