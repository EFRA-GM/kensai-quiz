/**
 * @kensai/quiz-core — headless engine for the Kensai Quiz format.
 *
 * Load and validate a quiz, evaluate answers, run an attempt (a UI-agnostic
 * state machine), and compute per-category statistics. No UI or DOM dependency;
 * any player consumes this package.
 */

export * from "./types.js";

export { DEFAULT_SETTINGS, resolveSettings } from "./settings.js";
export type { ResolvedSettings } from "./settings.js";

export { quizSchema } from "./schema.generated.js";

export { loadQuiz, parseQuizSource, QuizValidationError } from "./load.js";
export type { LoadOptions, SourceFormat } from "./load.js";

export { validateQuiz, validateSchema, validateReferences } from "./validate.js";
export type {
  ValidationResult,
  ValidationIssue,
  IssueSeverity,
  IssueKind,
} from "./validate.js";

export { evaluateQuiz, evaluateQuestion, gradeQuestion } from "./evaluate.js";
export type { QuizResult, QuestionResult, EvaluateOptions } from "./evaluate.js";

export { computeStats } from "./stats.js";
export type { QuizStats, CategoryStat, OverallStat } from "./stats.js";

export { resolveChoiceOptions, resolveGroups } from "./resolve.js";
export { normalizeText, textMatches } from "./text.js";

export { Attempt } from "./runtime.js";
export type {
  AttemptOptions,
  AttemptEvents,
  AttemptStatus,
  AttemptSnapshot,
  CurrentQuestion,
} from "./runtime.js";

export { Emitter } from "./events.js";
export type { Listener } from "./events.js";
