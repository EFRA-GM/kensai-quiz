import {
  Attempt,
  evaluateQuestion,
  loadQuiz,
  type AnswerInput,
  type Question,
  type QuestionResult,
  type Quiz,
  type QuizMetadata,
  type QuizResult,
  type ResolvedSettings,
} from "@kensai/quiz-core";
import { clear, el, mdEl } from "./dom";
import { injectStyles } from "./styles";
import { applyTheme, themeButton } from "./theme";
import { createQuestionView, type QuestionView } from "./views";
import { correctAnswerText, userAnswerText } from "./answers";
import { buildSettingsPanel, type EditableSettingKey } from "./settings-ui";

export interface PlayerOptions {
  /** Quiz source: a YAML/JSON string or an already-parsed object. Optional — a
   *  player can start empty and receive a quiz later via `setQuiz`/`setQuestions`. */
  quiz?: string | object;
  /** Format when `quiz` is a string. Default `"yaml"`. */
  format?: "yaml" | "json";
  /** Validate the quiz before rendering. Default `true`. */
  validate?: boolean;
  /** Per-attempt settings overrides (order, feedback, time_limit, passing_score…). */
  settings?: Partial<ResolvedSettings>;
  /** Begin the attempt immediately once a quiz is present. Default `true`. */
  autoStart?: boolean;
  /** Show a "Try again" button on the results screen. Default `true`. */
  allowRestart?: boolean;
  /** Settings the learner may change through the ⚙️ gear. Omitted/empty = locked
   *  (the developer fully controls behavior and no gear is shown). */
  editableSettings?: EditableSettingKey[];
  /** Show a ⛶ fullscreen toggle when the browser supports it. Default `true`. */
  fullscreen?: boolean;
  /** Show a ☀/🌙 light-dark theme toggle. Default `true`. */
  theme?: boolean;
  /** Injectable clock (ms epoch) — mainly for testing. */
  now?: () => number;
  /** Injectable RNG in [0,1) — for deterministic shuffles/order. */
  rng?: () => number;
  /** Called when the attempt finishes (manual or on time-up). */
  onFinish?: (result: QuizResult) => void;
  /** Called each time a question is answered (result present under immediate feedback). */
  onAnswer?: (result: QuestionResult | null) => void;
}

function fullscreenSupported(): boolean {
  return typeof document !== "undefined" && document.fullscreenEnabled === true;
}

/** An embeddable quiz player rendered into a host element. */
export class QuizPlayer {
  private readonly root: HTMLElement;
  private readonly options: PlayerOptions;
  private _quiz: Quiz | null = null;
  private attempt: Attempt | null = null;
  private view: QuestionView | null = null;
  private settingsOverride: Partial<ResolvedSettings>;
  private settingsOpen = false;
  private readonly checked = new Set<number>();
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private timerEl: HTMLElement | null = null;
  private focusTarget: HTMLElement | null = null;

  constructor(target: HTMLElement, options: PlayerOptions = {}) {
    injectStyles();
    this.root = target;
    this.options = options;
    this.settingsOverride = { ...(options.settings ?? {}) };
    applyTheme(this.root);
    this.installFullscreen();
    if (options.quiz != null) this.setQuiz(options.quiz, options.format);
    else this.render();
  }

  /** The loaded quiz, or `null` before one is set. */
  get quiz(): Quiz | null {
    return this._quiz;
  }

  /* -------------------------------------------------------- imperative API */

  /** Load (or replace) the quiz from a YAML/JSON string or a parsed object. */
  setQuiz(quiz: string | object, format?: "yaml" | "json"): this {
    this.stopTimer();
    this._quiz =
      typeof quiz === "string"
        ? loadQuiz(quiz, { format: format ?? this.options.format, validate: this.options.validate })
        : loadQuiz(quiz, { validate: this.options.validate });
    this.reset();
    if (this.options.autoStart !== false) this.start();
    else this.render();
    return this;
  }

  /** Convenience wrapper: build a quiz from a bare list of questions. */
  setQuestions(questions: Question[], metadata?: Partial<QuizMetadata>): this {
    return this.setQuiz({
      schema_version: "0.1",
      metadata: { title: "Quiz", ...metadata },
      questions,
    });
  }

  /** Merge per-attempt settings overrides and restart the attempt to apply them. */
  setSettings(patch: Partial<ResolvedSettings>): this {
    this.settingsOverride = { ...this.settingsOverride, ...patch };
    if (this._quiz) {
      this.stopTimer();
      this.reset();
      if (this.options.autoStart !== false) this.start();
      else this.render();
    }
    return this;
  }

  /** The resolved settings currently in effect, or `null` before a quiz is set. */
  getSettings(): ResolvedSettings | null {
    return this.attempt?.settings ?? null;
  }

  private reset(): void {
    if (!this._quiz) return;
    this.attempt = new Attempt(this._quiz, {
      settings: this.settingsOverride,
      now: this.options.now,
      rng: this.options.rng,
    });
    this.checked.clear();
    this.attempt.on("finished", ({ result }) => {
      this.stopTimer();
      this.options.onFinish?.(result);
      this.render();
    });
  }

  start(): void {
    if (!this.attempt) return;
    this.attempt.start();
    this.startTimer();
    this.render();
  }

  /** Discard progress and start a fresh attempt. */
  restart(): void {
    this.stopTimer();
    this.reset();
    this.start();
  }

  /** Remove the player from the DOM and clear timers/listeners. */
  destroy(): void {
    this.stopTimer();
    if (fullscreenSupported()) document.removeEventListener("fullscreenchange", this.fsHandler);
    clear(this.root);
  }

  private get mode(): "all" | "sequential" {
    return this.attempt!.settings.navigation;
  }

  /* -------------------------------------------------------------- fullscreen */

  private readonly fsHandler = (): void => {
    if (typeof document === "undefined") return;
    this.root.classList.toggle("kq-fullscreen", document.fullscreenElement === this.root);
  };

  private installFullscreen(): void {
    if (this.options.fullscreen !== false && fullscreenSupported()) {
      document.addEventListener("fullscreenchange", this.fsHandler);
    }
  }

  private toggleFullscreen(): void {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void this.root.requestFullscreen?.();
  }

  /* ----------------------------------------------------------- rendering */

  private render(): void {
    clear(this.root);
    this.root.classList.add("kq-root");

    if (!this._quiz || !this.attempt) {
      this.root.append(el("div", { class: "kq-empty" }, el("p", { text: "No quiz loaded." })));
      return;
    }

    const container = el("div", { class: "kq-container" });
    container.append(this.renderHeader());

    if (this.attempt.getStatus() === "finished") {
      container.append(this.renderResults());
    } else if (this.mode === "all") {
      container.append(this.renderAll());
    } else {
      container.append(this.renderSequential());
    }
    this.root.append(container);

    // Focus the first field/option (or the advance button) for immediate keyboard use.
    if (this.focusTarget) {
      this.focusTarget.focus({ preventScroll: true });
      this.focusTarget = null;
    }
  }

  private renderHeader(): HTMLElement {
    const quiz = this._quiz!;
    const header = el("div", { class: "kq-header" });

    const titleRow = el("div", { class: "kq-title-row" });
    titleRow.append(mdEl("h2", quiz.metadata.title, "kq-title"));
    const controls = this.renderControls();
    if (controls) titleRow.append(controls);
    header.append(titleRow);

    if (quiz.metadata.path) header.append(el("div", { class: "kq-path", text: quiz.metadata.path }));
    if (quiz.metadata.description) {
      header.append(mdEl("div", quiz.metadata.description, "kq-description"));
    }
    if (this.settingsOpen) header.append(this.renderSettingsPanel());
    return header;
  }

  private renderControls(): HTMLElement | null {
    const showGear = (this.options.editableSettings?.length ?? 0) > 0;
    const showFullscreen = this.options.fullscreen !== false && fullscreenSupported();
    const showTheme = this.options.theme !== false;
    if (!showGear && !showFullscreen && !showTheme) return null;

    const controls = el("div", { class: "kq-controls" });
    if (showTheme) {
      controls.append(
        themeButton(() => {
          applyTheme(this.root);
          this.render();
        }),
      );
    }
    if (showGear) {
      controls.append(
        el("button", {
          type: "button",
          class: "kq-icon-btn",
          title: "Settings",
          "aria-label": "Settings",
          onclick: () => {
            this.settingsOpen = !this.settingsOpen;
            this.render();
          },
        }, "⚙"),
      );
    }
    if (showFullscreen) {
      controls.append(
        el("button", {
          type: "button",
          class: "kq-icon-btn",
          title: "Toggle fullscreen",
          "aria-label": "Toggle fullscreen",
          onclick: () => this.toggleFullscreen(),
        }, "⛶"),
      );
    }
    return controls;
  }

  private renderSettingsPanel(): HTMLElement {
    return buildSettingsPanel({
      keys: this.options.editableSettings ?? [],
      current: this.attempt!.settings,
      onApply: (patch) => {
        this.settingsOpen = false;
        this.setSettings(patch);
      },
      onClose: () => {
        this.settingsOpen = false;
        this.render();
      },
    });
  }

  private renderMeta(progress: string): HTMLElement {
    const meta = el("div", { class: "kq-meta" });
    meta.append(el("span", { class: "kq-progress", text: progress }));
    if (this.attempt!.settings.time_limit != null) {
      this.timerEl = el("span", { class: "kq-timer" });
      this.updateTimer();
      meta.append(this.timerEl);
    }
    return meta;
  }

  private renderSequential(): HTMLElement {
    const quiz = this._quiz!;
    const attempt = this.attempt!;
    const wrap = el("div");
    const { question, index, position, total } = attempt.current();
    wrap.append(this.renderMeta(`Question ${position + 1} of ${total}`));

    this.view = createQuestionView(quiz, question, index, this.optionsFor(question, index));
    wrap.append(this.view.element);

    const immediate = attempt.settings.feedback === "immediate";
    const alreadyChecked = this.checked.has(index);
    const stored = attempt.getAnswers()[question.id ?? String(index)];
    if (stored !== undefined) this.view.setAnswer(stored);

    if (immediate && alreadyChecked) {
      this.view.setDisabled(true);
      this.view.element.append(this.renderFeedback(index));
    }

    // Footer
    const footer = el("div", { class: "kq-footer" });
    const prev = el("button", {
      type: "button",
      class: "kq-btn",
      disabled: !attempt.canGoPrev(),
      onclick: () => this.goPrev(),
    }, "Previous");
    footer.append(prev);

    const isLast = !attempt.canGoNext();
    const pendingCheck = immediate && !alreadyChecked;
    const primaryAction = pendingCheck
      ? () => this.check(index)
      : () => (isLast ? this.finish() : this.goNext());
    const primaryBtn = el(
      "button",
      { type: "button", class: "kq-btn kq-btn-primary", onclick: primaryAction },
      pendingCheck ? "Check" : isLast ? "Finish" : "Next",
    );
    footer.append(primaryBtn);
    wrap.append(footer);

    // Enter advances through the question's fields and then fires the primary button.
    this.wireEnter(wrap, true, primaryAction);
    this.focusTarget = firstFocusable(wrap) ?? primaryBtn;
    return wrap;
  }

  private renderAll(): HTMLElement {
    const quiz = this._quiz!;
    const wrap = el("div");
    wrap.append(this.renderMeta(`${quiz.questions.length} questions`));

    const views: { index: number; view: QuestionView }[] = [];
    for (const { question, index } of this.orderedQuestions()) {
      const view = createQuestionView(quiz, question, index, this.optionsFor(question, index));
      const stored = this.attempt!.getAnswers()[question.id ?? String(index)];
      if (stored !== undefined) view.setAnswer(stored);
      views.push({ index, view });
      wrap.append(view.element);
    }

    const footer = el("div", { class: "kq-footer" });
    footer.append(el("span", { class: "kq-progress" }));
    footer.append(
      el("button", { type: "button", class: "kq-btn kq-btn-primary", onclick: () => this.submitAll(views) }, "Finish"),
    );
    wrap.append(footer);

    // On a single-page quiz, Enter walks between fields (never auto-submits the whole set).
    this.wireEnter(wrap, false, () => this.submitAll(views));
    return wrap;
  }

  /**
   * Keyboard convenience: within `container`, Enter moves focus to the next
   * text/select field; on the last field (or a radio/checkbox) it fires `primary`
   * when `submitOnLast` is set. Textareas and IME composition are left alone.
   */
  private wireEnter(container: HTMLElement, submitOnLast: boolean, primary: () => void): void {
    container.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.tagName === "TEXTAREA") return;

      const fields = [...container.querySelectorAll<HTMLElement>("input.kq-text, select.kq-select")];
      const idx = fields.indexOf(target);
      if (idx !== -1 && idx < fields.length - 1) {
        event.preventDefault();
        fields[idx + 1]!.focus();
        return;
      }
      if (submitOnLast && (target.tagName === "INPUT" || target.tagName === "SELECT")) {
        event.preventDefault();
        primary();
      }
    });
  }

  private renderFeedback(index: number): HTMLElement {
    const quiz = this._quiz!;
    const question = quiz.questions[index]!;
    const answer = this.attempt!.getAnswers()[question.id ?? String(index)];
    const result = evaluateQuestion(quiz, question, index, answer);
    const state = result.correct ? "correct" : result.fraction > 0 ? "partial" : "incorrect";
    const title = result.correct ? "Correct" : result.fraction > 0 ? "Partially correct" : "Incorrect";

    const box = el("div", { class: `kq-feedback kq-is-${state}` });
    box.append(el("div", { class: "kq-feedback-title", text: title }));
    if (!result.correct) {
      box.append(
        el("div", { class: "kq-feedback-line" },
          el("span", { class: "kq-key", text: "Answer: " }),
          mdEl("span", correctAnswerText(quiz, question)),
        ),
      );
    }
    if (question.explanation) {
      box.append(el("div", { class: "kq-feedback-line" }, mdEl("span", question.explanation)));
    }
    return box;
  }

  private renderResults(): HTMLElement {
    const result = this.attempt!.finish(); // idempotent — returns the computed result
    const wrap = el("div", { class: "kq-results" });

    const pct = Math.round(result.ratio * 100);
    wrap.append(el("div", { class: "kq-score", text: `${pct}%` }));
    wrap.append(
      el("div", { class: "kq-score-sub", text: `${round(result.score)} / ${round(result.maxScore)} points` }),
    );
    if (result.passed !== null) {
      wrap.append(
        el("div", { class: `kq-badge ${result.passed ? "kq-pass" : "kq-fail"}`, text: result.passed ? "Passed" : "Not passed" }),
      );
    }

    // Per-category table (only when there is more than the single uncategorized bucket).
    const cats = result.stats.byCategory;
    if (cats.length > 1 || (cats[0] && cats[0].categoryId !== null)) {
      const table = el("table", { class: "kq-cat-table" });
      table.append(
        el("thead", {}, el("tr", {}, el("th", { text: "Category" }), el("th", { text: "Score" }))),
      );
      const tbody = el("tbody");
      for (const c of cats) {
        const name = c.label ?? c.categoryId ?? "Uncategorized";
        tbody.append(
          el("tr", {}, el("td", { text: name }), el("td", { text: `${c.correct}/${c.total} (${Math.round(c.accuracy * 100)}%)` })),
        );
      }
      table.append(tbody);
      wrap.append(table);
    }

    wrap.append(this.renderReview(result));

    if (this.options.allowRestart !== false) {
      const footer = el("div", { class: "kq-footer" });
      footer.append(el("span", { class: "kq-progress" }));
      footer.append(el("button", { type: "button", class: "kq-btn kq-btn-primary", onclick: () => this.restart() }, "Try again"));
      wrap.append(footer);
    }
    return wrap;
  }

  private renderReview(result: QuizResult): HTMLElement {
    const quiz = this._quiz!;
    const answers = this.attempt!.getAnswers();
    const review = el("div", { class: "kq-review" });
    review.append(el("div", { class: "kq-review-title", text: "Review" }));

    for (const r of result.results) {
      const question = quiz.questions[r.index]!;
      const answer: AnswerInput | undefined = answers[question.id ?? String(r.index)];
      const state = r.correct ? "correct" : r.fraction > 0 ? "partial" : "incorrect";
      const mark = r.correct ? "✓" : r.fraction > 0 ? "◐" : "✗";

      const item = el("div", { class: "kq-review-item" });
      item.append(
        el("div", { class: "kq-review-head" },
          el("span", { class: `kq-mark kq-is-${state}`, text: mark }),
          mdEl("span", question.prompt),
        ),
      );
      item.append(
        el("div", { class: "kq-review-line" },
          el("span", { class: "kq-key", text: "Your answer: " }),
          mdEl("span", userAnswerText(quiz, question, answer)),
        ),
      );
      if (!r.correct) {
        item.append(
          el("div", { class: "kq-review-line" },
            el("span", { class: "kq-key", text: "Correct: " }),
            mdEl("span", correctAnswerText(quiz, question)),
          ),
        );
      }
      if (question.explanation) {
        item.append(
          el("div", { class: "kq-review-line" }, el("span", { class: "kq-key", text: "Why: " }), mdEl("span", question.explanation)),
        );
      }
      review.append(item);
    }
    return review;
  }

  /* ------------------------------------------------------------- actions */

  private commitCurrent(): void {
    if (!this.view || !this.attempt) return;
    const answer = this.view.getAnswer();
    if (answer !== undefined) {
      const result = this.attempt.answer(answer);
      this.options.onAnswer?.(result);
    }
  }

  private check(index: number): void {
    if (!this.view || !this.attempt) return;
    const answer = this.view.getAnswer();
    const result = this.attempt.answer(answer ?? "");
    this.options.onAnswer?.(result);
    this.checked.add(index);
    this.render();
  }

  private goNext(): void {
    this.commitCurrent();
    this.attempt!.next();
    this.render();
  }

  private goPrev(): void {
    this.commitCurrent();
    this.attempt!.prev();
    this.render();
  }

  private finish(): void {
    this.commitCurrent();
    this.attempt!.finish(); // triggers the finished handler → render
  }

  private submitAll(views: { index: number; view: QuestionView }[]): void {
    for (const { index, view } of views) {
      const answer = view.getAnswer();
      if (answer !== undefined) this.attempt!.answerAt(index, answer);
    }
    this.attempt!.finish();
  }

  /** Presentation-ordered options for a choice question (undefined for other types). */
  private optionsFor(question: Quiz["questions"][number], index: number) {
    return question.type === "choice" ? this.attempt!.optionsFor(question, index) : undefined;
  }

  private orderedQuestions(): { question: Quiz["questions"][number]; index: number }[] {
    // Follow the attempt's presentation order, exposed via toJSON().order.
    const quiz = this._quiz!;
    return this.attempt!.toJSON().order.map((index) => ({ question: quiz.questions[index]!, index }));
  }

  /* -------------------------------------------------------------- timer */

  private startTimer(): void {
    if (!this.attempt || this.attempt.settings.time_limit == null) return;
    this.stopTimer();
    this.timerHandle = setInterval(() => {
      this.updateTimer();
      const remaining = this.attempt!.remainingTime();
      if (remaining !== null && remaining <= 0) this.attempt!.finish();
    }, 500);
  }

  private updateTimer(): void {
    if (!this.timerEl || !this.attempt) return;
    const remaining = this.attempt.remainingTime();
    if (remaining == null) return;
    const total = Math.max(0, Math.ceil(remaining));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    this.timerEl.textContent = `${mm}:${ss}`;
    this.timerEl.classList.toggle("kq-timer-low", total <= 10);
  }

  private stopTimer(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The first enabled field or option in a question, for initial keyboard focus. */
function firstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    "input.kq-text:not(:disabled), select.kq-select:not(:disabled), input.kq-input:not(:disabled)",
  );
}
