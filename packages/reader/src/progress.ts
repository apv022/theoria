import {
  packageId,
  type LearnerAssessmentState,
  type LearnerProgress,
  type LearnerQuestionState,
  type PackageId,
} from "@theoria/package-model";
import {
  earnedPoints,
  evaluateQuestion,
  evaluateResponse,
  responseComplete,
} from "./evaluation";
import {
  activityKey,
  lessonsOf,
  questionKey,
  type ReaderActivity,
  type ReaderQuestion,
  type ReaderStructure,
} from "./model";

const now = (): string => new Date().toISOString();

export function createProgress(
  localPackageId: PackageId,
  contentId: string,
  course: ReaderStructure,
): LearnerProgress {
  const timestamp = now();
  return {
    schema: 1,
    packageId: localPackageId,
    packageVersion: course.version,
    contentId,
    revision: 0,
    questions: {},
    activities: {},
    assessments: {},
    lessons: {},
    viewedActivities: {},
    questionOrders: {},
    matchingOrders: {},
    orderingOrders: {},
    manualCompletions: {},
    assignmentSubmissions: {},
    startedAt: timestamp,
    lastOpenedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function compatibleProgress(
  value: LearnerProgress | undefined,
  localPackageId: PackageId,
  contentId: string,
  course: ReaderStructure,
): LearnerProgress {
  return value?.schema === 1 &&
    value.packageId === localPackageId &&
    value.contentId === contentId &&
    value.packageVersion === course.version
    ? value
    : createProgress(localPackageId, contentId, course);
}

const changed = (
  state: LearnerProgress,
  patch: Partial<LearnerProgress>,
): LearnerProgress => {
  const timestamp = now();
  return {
    ...state,
    ...patch,
    revision: state.revision + 1,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };
};

const hash = (value: string): number => {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

const deterministicShuffle = (
  ids: readonly string[],
  seed: string,
  forbidden?: readonly string[],
): string[] => {
  const result = [...ids];
  let state = hash(seed) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const value = result[index]!;
    result[index] = result[other]!;
    result[other] = value;
  }
  if (
    result.length > 1 &&
    forbidden &&
    result.every((value, index) => value === forbidden[index])
  ) {
    result.push(result.shift()!);
  }
  return result;
};

export function prepareActivity(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
): {
  readonly state: LearnerProgress;
  readonly questions: readonly ReaderQuestion[];
} {
  const key = activityKey(lessonId, activity.id);
  let questionOrder = state.questionOrders[key];
  let questionOrders = state.questionOrders;
  if (!questionOrder) {
    const ids = activity.questions.map((question) => question.id);
    const ordered = activity.randomize
      ? deterministicShuffle(ids, `${state.contentId}:${key}:questions`)
      : ids;
    questionOrder = ordered.slice(
      0,
      activity.question_pool_size ?? ordered.length,
    );
    questionOrders = { ...questionOrders, [key]: questionOrder };
  }
  let matchingOrders = state.matchingOrders;
  let orderingOrders = state.orderingOrders;
  for (const question of activity.questions) {
    const qKey = questionKey(lessonId, activity.id, question.id);
    if (question.type === "matching" && !matchingOrders[qKey]) {
      const answer = question.answer as Record<string, string> | undefined;
      const forbidden = answer
        ? (question.premises ?? []).map((premise) => answer[premise.id]!)
        : undefined;
      matchingOrders = {
        ...matchingOrders,
        [qKey]: deterministicShuffle(
          (question.responses ?? []).map((response) => response.id),
          `${state.contentId}:${qKey}:matching`,
          forbidden,
        ),
      };
    }
    if (question.type === "ordering" && !orderingOrders[qKey]) {
      orderingOrders = {
        ...orderingOrders,
        [qKey]: deterministicShuffle(
          (question.items ?? []).map((item) => item.id),
          `${state.contentId}:${qKey}:ordering`,
          Array.isArray(question.answer)
            ? (question.answer as string[])
            : undefined,
        ),
      };
    }
  }
  const next =
    questionOrders === state.questionOrders &&
    matchingOrders === state.matchingOrders &&
    orderingOrders === state.orderingOrders
      ? state
      : changed(state, { questionOrders, matchingOrders, orderingOrders });
  const selected = new Set(questionOrder);
  return {
    state: next,
    questions: activity.questions.filter((question) =>
      selected.has(question.id),
    ),
  };
}

export function recordResponse(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
  question: ReaderQuestion,
  response: unknown,
): LearnerProgress {
  const key = questionKey(lessonId, activity.id, question.id);
  const previous = state.questions[key];
  const value: LearnerQuestionState = {
    response,
    complete: previous?.complete ?? false,
    correct: previous?.correct ?? null,
    attempted: true,
    checked: previous?.checked ?? false,
    earned: previous?.earned ?? null,
    attempts: previous?.attempts ?? 0,
    updatedAt: now(),
  };
  return refreshCompletion(
    changed(state, {
      questions: { ...state.questions, [key]: value },
      currentLessonId: lessonId,
    }),
    lessonId,
    activity,
  );
}

export function checkQuestion(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
  question: ReaderQuestion,
): {
  readonly state: LearnerProgress;
  readonly result: ReturnType<typeof evaluateResponse>;
} {
  const key = questionKey(lessonId, activity.id, question.id);
  const previous = state.questions[key];
  const response = previous?.response;
  const nonObjective =
    question.evaluation === "manual" || question.evaluation === "ungraded";
  const result = nonObjective
    ? {
        complete: responseComplete(question, response),
        correct: null,
        earned: null,
        feedback: responseComplete(question, response)
          ? [
              question.evaluation === "manual"
                ? "Response submitted. Manual review is pending."
                : "Ungraded response saved.",
            ]
          : ["Add a response first."],
      }
    : evaluateResponse(
        question,
        response,
        activity.type === "practice" && question.evaluation !== "completion",
      );
  const questions = {
    ...state.questions,
    [key]: {
      response,
      complete: result.complete,
      correct: result.correct,
      attempted: true,
      checked: true,
      earned: result.earned,
      attempts: (previous?.attempts ?? 0) + 1,
      updatedAt: now(),
    },
  };
  return {
    state: refreshCompletion(changed(state, { questions }), lessonId, activity),
    result,
  };
}

export function submitAssessment(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
): {
  readonly state: LearnerProgress;
  readonly outcome:
    | { readonly status: "incomplete"; readonly missing: readonly string[] }
    | {
        readonly status: "submitted";
        readonly assessment: LearnerAssessmentState;
      };
} {
  const prepared = prepareActivity(state, lessonId, activity);
  state = prepared.state;
  const missing = prepared.questions.filter((question) => {
    if (!question.required) return false;
    const response =
      state.questions[questionKey(lessonId, activity.id, question.id)]
        ?.response;
    return question.type === "essay" || question.type === "open_response"
      ? !evaluateResponse(question, response, false).complete
      : !responseComplete(question, response);
  });
  if (missing.length) {
    return {
      state,
      outcome: {
        status: "incomplete",
        missing: missing.map((item) => item.id),
      },
    };
  }
  let earned = 0;
  let possible = 0;
  const questions = { ...state.questions };
  for (const question of prepared.questions) {
    const key = questionKey(lessonId, activity.id, question.id);
    const previous = questions[key];
    const response = previous?.response;
    const manual =
      question.evaluation === "manual" ||
      question.evaluation === "ungraded" ||
      question.type === "essay" ||
      question.type === "open_response";
    if (
      !manual &&
      question.points > 0 &&
      (question.required || responseComplete(question, response))
    ) {
      possible += question.points;
      earned += earnedPoints(question, response);
    }
    questions[key] = {
      response,
      complete:
        question.type === "essay" || question.type === "open_response"
          ? evaluateResponse(question, response, false).complete
          : responseComplete(question, response),
      correct: manual ? null : evaluateQuestion(question, response),
      attempted: true,
      checked: !manual,
      earned: manual ? null : earnedPoints(question, response),
      attempts: (previous?.attempts ?? 0) + 1,
      updatedAt: now(),
    };
  }
  const pendingManual = prepared.questions.some(
    (question) =>
      question.required &&
      (question.evaluation === "manual" ||
        question.type === "essay" ||
        question.type === "open_response"),
  );
  const score = possible ? earned / possible : 0;
  const previousAssessment =
    state.assessments[activityKey(lessonId, activity.id)];
  const assessment: LearnerAssessmentState = {
    submitted: true,
    score,
    possible,
    passed:
      pendingManual || activity.passing_score === undefined
        ? null
        : score >= activity.passing_score,
    pendingManual,
    attempts: (previousAssessment?.attempts ?? 0) + 1,
    submittedAt: now(),
  };
  const next = changed(state, {
    questions,
    assessments: {
      ...state.assessments,
      [activityKey(lessonId, activity.id)]: assessment,
    },
  });
  return {
    state: refreshCompletion(next, lessonId, activity),
    outcome: { status: "submitted", assessment },
  };
}

export function markActivityComplete(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
): LearnerProgress {
  const key = activityKey(lessonId, activity.id);
  return refreshCompletion(
    changed(state, {
      manualCompletions: { ...state.manualCompletions, [key]: true },
      viewedActivities: { ...state.viewedActivities, [key]: true },
    }),
    lessonId,
    activity,
  );
}

export function markActivityViewed(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
): LearnerProgress {
  const key = activityKey(lessonId, activity.id);
  if (state.viewedActivities[key]) return state;
  return refreshCompletion(
    changed(state, {
      viewedActivities: { ...state.viewedActivities, [key]: true },
      currentLessonId: lessonId,
    }),
    lessonId,
    activity,
  );
}

export function submitAssignment(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
  response: {
    readonly text?: string;
    readonly url?: string;
    readonly files: readonly {
      readonly name: string;
      readonly size: number;
      readonly type: string;
    }[];
  },
): {
  readonly state: LearnerProgress;
  readonly complete: boolean;
  readonly message: string;
} {
  const modes = activity.submission?.modes ?? [];
  let validUrl = true;
  if (response.url) {
    try {
      validUrl = ["http:", "https:"].includes(new URL(response.url).protocol);
    } catch {
      validUrl = false;
    }
  }
  const minimum = activity.submission?.minimum_files ?? 0;
  const maximum = activity.submission?.maximum_files ?? Infinity;
  const complete =
    validUrl &&
    response.files.length >= minimum &&
    response.files.length <= maximum &&
    ((modes.includes("text") && Boolean(response.text?.trim())) ||
      (modes.includes("url") && Boolean(response.url?.trim())) ||
      (modes.includes("file") && response.files.length > 0));
  const key = activityKey(lessonId, activity.id);
  const submissions = complete
    ? {
        ...state.assignmentSubmissions,
        [key]: { ...response, submittedAt: now() },
      }
    : state.assignmentSubmissions;
  const next = refreshCompletion(
    changed(state, { assignmentSubmissions: submissions }),
    lessonId,
    activity,
  );
  return {
    state: next,
    complete,
    message: complete
      ? "Submitted locally. Manual or host-platform review remains pending."
      : "Add a valid declared response and satisfy the file requirements before submitting.",
  };
}

function conditionMet(
  course: ReaderStructure,
  state: LearnerProgress,
  lessonId: string,
  condition: {
    readonly activity?: string;
    readonly question?: string;
    readonly requirement?: string;
    readonly minimum_score?: number;
  },
): boolean {
  const lesson = lessonsOf(course).find((item) => item.id === lessonId);
  if (!lesson || !("requirement" in condition)) return false;
  const activity = condition.activity
    ? lesson.activities.find((item) => item.id === condition.activity)
    : condition.question
      ? lesson.activities.find((item) =>
          item.questions.some((question) => question.id === condition.question),
        )
      : undefined;
  const question = condition.question
    ? activity?.questions.find((item) => item.id === condition.question)
    : undefined;
  if (!activity) return false;
  const aKey = activityKey(lessonId, activity.id);
  const qKey = question
    ? questionKey(lessonId, activity.id, question.id)
    : undefined;
  const questionState = qKey ? state.questions[qKey] : undefined;
  const assessment = state.assessments[aKey];
  switch (condition.requirement) {
    case "viewed":
      return Boolean(state.viewedActivities[aKey]);
    case "attempted":
      return question
        ? Boolean(questionState?.attempted)
        : activity.questions.some(
            (item) =>
              state.questions[questionKey(lessonId, activity.id, item.id)]
                ?.attempted,
          );
    case "answered":
      return question
        ? responseComplete(question, questionState?.response)
        : activity.questions
            .filter((item) => item.required)
            .every((item) =>
              responseComplete(
                item,
                state.questions[questionKey(lessonId, activity.id, item.id)]
                  ?.response,
              ),
            );
    case "submitted":
      return activity.type === "assignment"
        ? Boolean(state.assignmentSubmissions[aKey])
        : Boolean(assessment?.submitted);
    case "passed":
      return (
        assessment?.passed === true &&
        (condition.minimum_score === undefined ||
          assessment.score >= condition.minimum_score)
      );
    case "manually_marked_complete":
      return Boolean(state.manualCompletions[qKey ?? aKey]);
    default:
      return false;
  }
}

function expressionMet(
  course: ReaderStructure,
  state: LearnerProgress,
  lessonId: string,
  expression: NonNullable<
    ReaderStructure["chapters"][number]["lessons"][number]["completion"]
  >,
  depth = 1,
): boolean {
  if (depth > 8) return false;
  const entries = expression.all ?? expression.any;
  if (!entries?.length) return false;
  const values = entries.map((entry) =>
    "requirement" in entry
      ? conditionMet(course, state, lessonId, entry)
      : expressionMet(course, state, lessonId, entry, depth + 1),
  );
  return expression.any ? values.some(Boolean) : values.every(Boolean);
}

function fallbackActivityComplete(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
): boolean {
  const key = activityKey(lessonId, activity.id);
  const selectedIds = new Set(
    state.questionOrders[key] ??
      activity.questions.map((question) => question.id),
  );
  const required = activity.questions.filter(
    (question) => selectedIds.has(question.id) && question.required,
  );
  if (activity.type === "notes") return Boolean(state.manualCompletions[key]);
  if (activity.type === "assessment") {
    const assessment = state.assessments[key];
    return activity.passing_score === undefined
      ? Boolean(assessment?.submitted)
      : assessment?.submitted === true && assessment.passed === true;
  }
  if (activity.type === "assignment")
    return Boolean(state.assignmentSubmissions[key]);
  if (activity.evaluation === "manual")
    return required.every(
      (question) =>
        state.questions[questionKey(lessonId, activity.id, question.id)]
          ?.attempted,
    );
  if (activity.evaluation === "completion")
    return required.every(
      (question) =>
        state.questions[questionKey(lessonId, activity.id, question.id)]
          ?.complete,
    );
  if (activity.evaluation === "ungraded")
    return (
      Boolean(state.manualCompletions[key]) ||
      required.every((question) =>
        responseComplete(
          question,
          state.questions[questionKey(lessonId, activity.id, question.id)]
            ?.response,
        ),
      )
    );
  return required.every((question) => {
    const item =
      state.questions[questionKey(lessonId, activity.id, question.id)];
    return item?.checked && responseComplete(question, item.response);
  });
}

export function refreshAllCompletion(
  course: ReaderStructure,
  state: LearnerProgress,
): LearnerProgress {
  const activities = { ...state.activities };
  const lessons = { ...state.lessons };
  for (const lesson of lessonsOf(course)) {
    for (const activity of lesson.activities) {
      activities[activityKey(lesson.id, activity.id)] =
        fallbackActivityComplete({ ...state, activities }, lesson.id, activity);
    }
    lessons[lesson.id] = lesson.completion
      ? expressionMet(
          course,
          { ...state, activities },
          lesson.id,
          lesson.completion,
        )
      : lesson.activities.every(
          (activity) => activities[activityKey(lesson.id, activity.id)],
        );
  }
  const complete =
    Object.values(lessons).filter(Boolean).length === lessonsOf(course).length;
  return {
    ...state,
    activities,
    lessons,
    ...(complete && !state.completedAt ? { completedAt: now() } : {}),
  };
}

function refreshCompletion(
  state: LearnerProgress,
  lessonId: string,
  activity: ReaderActivity,
): LearnerProgress {
  const key = activityKey(lessonId, activity.id);
  return {
    ...state,
    activities: {
      ...state.activities,
      [key]: fallbackActivityComplete(state, lessonId, activity),
    },
  };
}

export function coursePercent(
  course: ReaderStructure,
  state: LearnerProgress,
): number {
  const lessons = lessonsOf(course);
  return lessons.length
    ? Math.round(
        (lessons.filter((lesson) => state.lessons[lesson.id]).length /
          lessons.length) *
          100,
      )
    : 0;
}

export function localPackageId(
  manifestId: string,
  version: string,
  checksum: string,
): PackageId {
  return packageId(`${manifestId}@${version}:${checksum.slice(0, 12)}`);
}
