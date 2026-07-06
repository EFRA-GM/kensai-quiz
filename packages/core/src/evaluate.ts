import type { AnswerInput, Question, Quiz } from "./types.js";
import { resolveChoiceOptions } from "./resolve.js";
import { normalizeText } from "./text.js";
import { resolveSettings, type ResolvedSettings } from "./settings.js";
import { computeStats, type QuizStats } from "./stats.js";

export interface QuestionResult {
  /** Index into `quiz.questions`. */
  index: number;
  id?: string;
  type: Question["type"];
  category?: string;
  answered: boolean;
  /** Whole-question correctness (`fraction === 1`). */
  correct: boolean;
  /** Correctness in 0..1 — partial where meaningful (fill_blank, classify, matching, ordering). */
  fraction: number;
  /** Earned points: `fraction * maxScore`. */
  score: number;
  /** `points` (default 1). */
  maxScore: number;
}

export interface QuizResult {
  results: QuestionResult[];
  score: number;
  maxScore: number;
  /** `score / maxScore` (0 when `maxScore` is 0). */
  ratio: number;
  /** Pass/fail vs the resolved `passing_score`; `null` when it is unset. */
  passed: boolean | null;
  stats: QuizStats;
}

export interface EvaluateOptions {
  /** Per-attempt settings overrides (e.g. a player-provided `passing_score`). */
  settingsOverride?: Partial<ResolvedSettings>;
}

const pointsOf = (question: Question): number => question.points ?? 1;

function isBlankAnswer(answer: AnswerInput | undefined): boolean {
  if (answer === undefined || answer === null) return true;
  if (typeof answer === "string") return answer.trim() === "";
  if (Array.isArray(answer)) return answer.length === 0;
  if (typeof answer === "object") return Object.keys(answer).length === 0;
  return false; // boolean (true_false) is always a real answer
}

/**
 * Grade a single question, returning correctness in 0..1. Types with independent
 * sub-parts (fill_blank, classify, matching, ordering) return partial credit;
 * choice/true_false/short_answer are all-or-nothing.
 */
export function gradeQuestion(
  quiz: Quiz,
  question: Question,
  answer: AnswerInput | undefined,
): number {
  if (answer === undefined || answer === null) return 0;

  switch (question.type) {
    case "choice": {
      const optionIds = new Set(resolveChoiceOptions(quiz, question).map((o) => o.id));
      const expectedList = (Array.isArray(question.answer) ? question.answer : [question.answer])
        .filter((id) => optionIds.has(id));
      const expected = new Set(expectedList);
      if (expected.size === 0) return 0;
      const givenList = (Array.isArray(answer) ? answer : [answer]).filter(
        (a): a is string => typeof a === "string",
      );
      const given = new Set(givenList);
      if (given.size !== expected.size) return 0;
      for (const id of given) if (!expected.has(id)) return 0;
      return 1;
    }

    case "true_false":
      return answer === question.answer ? 1 : 0;

    case "short_answer": {
      if (typeof answer !== "string") return 0;
      const caseSensitive = question.case_sensitive ?? false;
      const given = normalizeText(answer, caseSensitive);
      return question.accept.some((a) => normalizeText(a, caseSensitive) === given) ? 1 : 0;
    }

    case "fill_blank": {
      const given = asRecord(answer);
      const keys = Object.keys(question.blanks);
      if (keys.length === 0) return 0;
      let correct = 0;
      for (const key of keys) {
        const blank = question.blanks[key]!;
        const value = given[key];
        if (value === undefined) continue;
        if (blank.options && blank.answer !== undefined) {
          if (value === blank.answer) correct++;
        } else if (blank.accept) {
          const caseSensitive = blank.case_sensitive ?? false;
          const normalized = normalizeText(value, caseSensitive);
          if (blank.accept.some((a) => normalizeText(a, caseSensitive) === normalized)) correct++;
        }
      }
      return correct / keys.length;
    }

    case "classify": {
      const given = asRecord(answer);
      if (question.items.length === 0) return 0;
      let correct = 0;
      for (const item of question.items) if (given[item.id] === item.answer) correct++;
      return correct / question.items.length;
    }

    case "matching": {
      const given = asRecord(answer);
      const keys = Object.keys(question.answer);
      if (keys.length === 0) return 0;
      let correct = 0;
      for (const key of keys) if (given[key] === question.answer[key]) correct++;
      return correct / keys.length;
    }

    case "ordering": {
      const given = Array.isArray(answer) ? (answer as string[]) : [];
      const expected = question.answer;
      if (expected.length === 0) return 0;
      let correct = 0;
      for (let i = 0; i < expected.length; i++) if (given[i] === expected[i]) correct++;
      return correct / expected.length;
    }

    default:
      return 0;
  }
}

/** Evaluate one question against a submitted answer (or `undefined` if unanswered). */
export function evaluateQuestion(
  quiz: Quiz,
  question: Question,
  index: number,
  answer: AnswerInput | undefined,
): QuestionResult {
  const fraction = gradeQuestion(quiz, question, answer);
  const maxScore = pointsOf(question);
  return {
    index,
    id: question.id,
    type: question.type,
    category: question.category,
    answered: !isBlankAnswer(answer),
    correct: fraction >= 1,
    fraction,
    score: fraction * maxScore,
    maxScore,
  };
}

/**
 * Evaluate a whole quiz. `answers` is keyed by question id, falling back to the
 * stringified question index for questions without an id.
 */
export function evaluateQuiz(
  quiz: Quiz,
  answers: Record<string, AnswerInput>,
  options: EvaluateOptions = {},
): QuizResult {
  const settings = resolveSettings(quiz.settings, options.settingsOverride);
  const results = quiz.questions.map((question, index) => {
    const key = question.id ?? String(index);
    return evaluateQuestion(quiz, question, index, answers[key]);
  });

  const score = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = results.reduce((sum, r) => sum + r.maxScore, 0);
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const passed = settings.passing_score == null ? null : ratio >= settings.passing_score;
  const stats = computeStats(quiz, results);

  return { results, score, maxScore, ratio, passed, stats };
}

function asRecord(value: AnswerInput): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}
