import type { AnswerInput, Option, Question, Quiz } from "./types.js";
import { resolveSettings, type ResolvedSettings } from "./settings.js";
import {
  evaluateQuestion,
  evaluateQuiz,
  type QuestionResult,
  type QuizResult,
} from "./evaluate.js";
import { resolveChoiceOptions } from "./resolve.js";
import { Emitter } from "./events.js";

export type AttemptStatus = "not_started" | "in_progress" | "finished";

// A `type` (not `interface`) so it satisfies the Emitter's `Record<string, unknown>` bound.
export type AttemptEvents = {
  started: { at: number };
  answered: {
    questionIndex: number;
    questionId?: string;
    /** Present only when feedback is `immediate`. */
    result: QuestionResult | null;
  };
  navigated: { position: number; questionIndex: number };
  time_up: { at: number };
  finished: { at: number; result: QuizResult };
};

export interface AttemptOptions {
  /** Per-attempt settings overrides (a player choosing order/feedback/time, etc.). */
  settings?: Partial<ResolvedSettings>;
  /** Clock source (ms epoch). Injectable for testing/SSR. Default: `Date.now`. */
  now?: () => number;
  /** RNG in [0,1). Injectable for deterministic shuffles. Default: `Math.random`. */
  rng?: () => number;
}

/** Serializable attempt state, for persistence and resume. */
export interface AttemptSnapshot {
  status: AttemptStatus;
  order: number[];
  position: number;
  answers: Record<string, AnswerInput>;
  startedAt: number | null;
  finishedAt: number | null;
  /** Per-question shuffled option order (question index → ordered option ids). */
  optionOrder?: Record<number, string[]>;
}

export interface CurrentQuestion {
  question: Question;
  /** Index into `quiz.questions`. */
  index: number;
  /** Index into the presentation `order`. */
  position: number;
  total: number;
  answer: AnswerInput | undefined;
}

/**
 * A headless quiz attempt: a UI-agnostic state machine over navigation, answers,
 * feedback timing, and an optional time limit. It never touches the DOM or timers —
 * a UI subscribes to events and drives the clock. All scoring delegates to
 * `evaluate`. Time is checked lazily on interaction via the injected `now()`.
 */
export class Attempt extends Emitter<AttemptEvents> {
  readonly quiz: Quiz;
  readonly settings: ResolvedSettings;

  private readonly now: () => number;
  private readonly rng: () => number;

  private status: AttemptStatus = "not_started";
  private order: number[];
  private optionOrder: Record<number, string[]>;
  private position = 0;
  private answers: Record<string, AnswerInput> = {};
  private startedAt: number | null = null;
  private finishedAt: number | null = null;
  private lastResult: QuizResult | null = null;

  constructor(quiz: Quiz, options: AttemptOptions = {}) {
    super();
    this.quiz = quiz;
    this.settings = resolveSettings(quiz.settings, options.settings);
    this.now = options.now ?? (() => Date.now());
    this.rng = options.rng ?? (() => Math.random());
    this.order = this.buildOrder();
    this.optionOrder = this.buildOptionOrder();
  }

  private buildOrder(): number[] {
    const indices = this.quiz.questions.map((_, i) => i);
    if (this.settings.order === "random") shuffle(indices, this.rng);
    return indices;
  }

  /**
   * Precompute a stable shuffled option order per choice question, once, so options
   * don't jump around between renders. Honors the per-question `shuffle_options`
   * opt-out (default allowed) and only runs when the setting is enabled.
   */
  private buildOptionOrder(): Record<number, string[]> {
    const map: Record<number, string[]> = {};
    if (!this.settings.shuffle_options) return map;
    this.quiz.questions.forEach((question, index) => {
      if (question.type !== "choice" || question.shuffle_options === false) return;
      const ids = resolveChoiceOptions(this.quiz, question).map((o) => o.id);
      shuffle(ids, this.rng);
      map[index] = ids;
    });
    return map;
  }

  private keyFor(index: number): string {
    return this.quiz.questions[index]!.id ?? String(index);
  }

  getStatus(): AttemptStatus {
    return this.status;
  }

  start(): void {
    if (this.status !== "not_started") return;
    this.status = "in_progress";
    this.startedAt = this.now();
    this.emit("started", { at: this.startedAt });
  }

  current(): CurrentQuestion {
    const index = this.order[this.position]!;
    return {
      question: this.quiz.questions[index]!,
      index,
      position: this.position,
      total: this.order.length,
      answer: this.answers[this.keyFor(index)],
    };
  }

  /**
   * Options in presentation order for a choice question at `index`. Uses the stable
   * per-attempt shuffle when enabled; otherwise the authored order. Returns `[]` for
   * non-choice questions.
   */
  optionsFor(question: Question, index: number): Option[] {
    if (question.type !== "choice") return [];
    const options = resolveChoiceOptions(this.quiz, question);
    const order = this.optionOrder[index];
    if (!order) return options.slice();
    const byId = new Map(options.map((o) => [o.id, o] as const));
    const ordered = order.map((id) => byId.get(id)).filter((o): o is Option => o !== undefined);
    // Defensive: keep any option missing from the stored order (appended at the end).
    for (const option of options) if (!order.includes(option.id)) ordered.push(option);
    return ordered;
  }

  /** Remaining seconds, or `null` when there is no time limit. */
  remainingTime(): number | null {
    if (this.settings.time_limit == null) return null;
    if (this.startedAt == null) return this.settings.time_limit;
    const elapsed = (this.now() - this.startedAt) / 1000;
    return Math.max(0, this.settings.time_limit - elapsed);
  }

  /** If the time limit has elapsed, emit `time_up` and finish. Returns true if it did. */
  private enforceTime(): boolean {
    const remaining = this.remainingTime();
    if (remaining !== null && remaining <= 0 && this.status === "in_progress") {
      this.emit("time_up", { at: this.now() });
      this.finish();
      return true;
    }
    return false;
  }

  /** Answer the current question. Returns a result only under `immediate` feedback. */
  answer(answer: AnswerInput): QuestionResult | null {
    if (this.status === "not_started") this.start();
    if (this.enforceTime()) return null;
    if (this.status !== "in_progress") return null;
    return this.setAnswer(this.current().index, answer);
  }

  /** Answer an arbitrary question by its index in `quiz.questions`. */
  answerAt(index: number, answer: AnswerInput): QuestionResult | null {
    if (this.status === "not_started") this.start();
    if (this.enforceTime()) return null;
    if (this.status !== "in_progress") return null;
    if (index < 0 || index >= this.quiz.questions.length) return null;
    return this.setAnswer(index, answer);
  }

  private setAnswer(index: number, answer: AnswerInput): QuestionResult | null {
    const question = this.quiz.questions[index]!;
    this.answers[this.keyFor(index)] = answer;
    const result =
      this.settings.feedback === "immediate"
        ? evaluateQuestion(this.quiz, question, index, answer)
        : null;
    this.emit("answered", { questionIndex: index, questionId: question.id, result });
    return result;
  }

  canGoNext(): boolean {
    return this.position < this.order.length - 1;
  }

  canGoPrev(): boolean {
    return this.position > 0;
  }

  next(): CurrentQuestion | null {
    if (this.enforceTime()) return null;
    if (!this.canGoNext()) return null;
    this.position++;
    this.emitNavigated();
    return this.current();
  }

  prev(): CurrentQuestion | null {
    if (!this.canGoPrev()) return null;
    this.position--;
    this.emitNavigated();
    return this.current();
  }

  goto(position: number): CurrentQuestion | null {
    if (position < 0 || position >= this.order.length) return null;
    this.position = position;
    this.emitNavigated();
    return this.current();
  }

  private emitNavigated(): void {
    this.emit("navigated", {
      position: this.position,
      questionIndex: this.order[this.position]!,
    });
  }

  getAnswers(): Record<string, AnswerInput> {
    return { ...this.answers };
  }

  /** Finalize the attempt, evaluate all answers, and emit `finished`. Idempotent. */
  finish(): QuizResult {
    if (this.status === "finished" && this.lastResult) return this.lastResult;
    this.status = "finished";
    this.finishedAt = this.now();
    const result = evaluateQuiz(this.quiz, this.answers, { settingsOverride: this.settings });
    this.lastResult = result;
    this.emit("finished", { at: this.finishedAt, result });
    return result;
  }

  /** Live result snapshot without finishing (e.g. for progress display). */
  peekResult(): QuizResult {
    return evaluateQuiz(this.quiz, this.answers, { settingsOverride: this.settings });
  }

  /** Serializable snapshot for persistence. */
  toJSON(): AttemptSnapshot {
    return {
      status: this.status,
      order: this.order.slice(),
      position: this.position,
      answers: { ...this.answers },
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      optionOrder: cloneOptionOrder(this.optionOrder),
    };
  }

  /** Rebuild an attempt from a snapshot (preserves order, answers, and progress). */
  static resume(quiz: Quiz, snapshot: AttemptSnapshot, options: AttemptOptions = {}): Attempt {
    const attempt = new Attempt(quiz, options);
    attempt.status = snapshot.status;
    attempt.order = snapshot.order.slice();
    attempt.position = snapshot.position;
    attempt.answers = { ...snapshot.answers };
    attempt.startedAt = snapshot.startedAt;
    attempt.finishedAt = snapshot.finishedAt;
    if (snapshot.optionOrder) attempt.optionOrder = cloneOptionOrder(snapshot.optionOrder);
    return attempt;
  }
}

/** Deep-clone the question-index → option-ids map. */
function cloneOptionOrder(order: Record<number, string[]>): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const [key, ids] of Object.entries(order)) out[Number(key)] = ids.slice();
  return out;
}

/** In-place Fisher–Yates shuffle using an injectable RNG. */
function shuffle<T>(array: T[], rng: () => number): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i]!;
    array[i] = array[j]!;
    array[j] = tmp;
  }
}
