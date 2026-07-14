import { loadQuiz, QuizValidationError, type ResolvedSettings } from "@kensai/quiz-core";
import { clear, el, mdEl, resolveTarget } from "./dom";
import { injectStyles } from "./styles";
import { QuizPlayer, type PlayerOptions } from "./player";
import { buildSettingsPanel, type EditableSettingKey } from "./settings-ui";
import { readJSON, writeJSON } from "./storage";
import { applyTheme, themeButton } from "./theme";
import { aiAuthoringGuide } from "./ai-guide.generated";

/** Human-viewable link to the authoring guide (for the info line, not for the model). */
const AI_GUIDE_BLOB =
  "https://github.com/EFRA-GM/kensai-quiz/blob/master/spec/AI_AUTHORING_GUIDE.md";

function fullscreenSupported(): boolean {
  return typeof document !== "undefined" && document.fullscreenEnabled === true;
}

export interface LibraryOptions {
  /** localStorage key under which the saved quizzes live. Default `"kensai-quiz-library"`. */
  storageKey?: string;
  /** Heading shown above the list. Default `"My quizzes"`. */
  title?: string;
  /** Settings the learner may tweak (per quiz and while playing). Defaults to all of them. */
  editableSettings?: EditableSettingKey[];
  /** Default presentation variant per question type (e.g. `{ classify: "buckets" }`). */
  views?: PlayerOptions["views"];
  /** Whether the learner may switch a question's view. Default `true`. */
  editableViews?: PlayerOptions["editableViews"];
  /** Show the ⛶ fullscreen toggle in the player. Default `true`. */
  fullscreen?: boolean;
  /** Validate quizzes on save/play. Default `true`. */
  validate?: boolean;
  /** Per-attempt settings applied to newly added quizzes. Defaults to one question
   *  at a time with immediate feedback (a good study default); the learner can change
   *  these per quiz via the ⚙️ gear. */
  defaultSettings?: Partial<ResolvedSettings>;
  /** Injectable clock/RNG — mainly for testing. */
  now?: () => number;
  rng?: () => number;
}

/** One quiz as persisted in the browser. */
interface StoredQuiz {
  id: string;
  title: string;
  count: number;
  source: string;
  format: "yaml" | "json";
  savedAt: number;
  settings?: Partial<ResolvedSettings>;
}

const DEFAULT_EDITABLE: EditableSettingKey[] = [
  "navigation",
  "feedback",
  "shuffle",
  "time_limit",
];

/** Study-friendly defaults for quizzes added through the playground. */
const DEFAULT_LIBRARY_SETTINGS: Partial<ResolvedSettings> = {
  navigation: "sequential",
  feedback: "immediate",
};

/**
 * The "playground" shell: start with no quiz, let the learner upload a `.yaml`
 * file or paste YAML, keep their quizzes in this browser's `localStorage`, and
 * replay any of them. Each list entry has ▶️ play, ⚙️ settings, and 🗑️ delete.
 */
export class QuizLibrary {
  private readonly root: HTMLElement;
  private readonly options: LibraryOptions;
  private readonly storageKey: string;
  private quizzes: StoredQuiz[];
  private player: QuizPlayer | null = null;
  private playingId: string | null = null;
  private settingsFor: string | null = null;
  private pasteOpen = false;
  private promptOpen = false;
  private error: string | null = null;

  constructor(target: HTMLElement, options: LibraryOptions = {}) {
    injectStyles();
    this.root = target;
    this.options = options;
    this.storageKey = options.storageKey ?? "kensai-quiz-library";
    this.quizzes = readJSON<StoredQuiz[]>(this.storageKey, []);
    applyTheme(this.root);
    this.installFullscreen();
    this.render();
  }

  /** Programmatically add a quiz (same path the paste/upload UI uses). */
  addQuiz(source: string, format: "yaml" | "json" = "yaml"): this {
    this.save(source, format);
    return this;
  }

  /** Remove the shell (and any running player) from the DOM. */
  destroy(): void {
    this.player?.destroy();
    if (fullscreenSupported()) document.removeEventListener("fullscreenchange", this.fsHandler);
    clear(this.root);
  }

  /* ------------------------------------------------------------ fullscreen */

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

  private editableKeys(): EditableSettingKey[] {
    return this.options.editableSettings ?? DEFAULT_EDITABLE;
  }

  private persist(): void {
    writeJSON(this.storageKey, this.quizzes);
  }

  private save(rawSource: string, format: "yaml" | "json"): void {
    // The AI prompt asks for the quiz inside a ```yaml block; tolerate a pasted fence.
    const source = stripCodeFence(rawSource);
    try {
      const quiz = loadQuiz(source, { format, validate: this.options.validate });
      const stored: StoredQuiz = {
        id: makeId(),
        title: quiz.metadata.title,
        count: quiz.questions.length,
        source,
        format,
        savedAt: Date.now(),
        settings: { ...(this.options.defaultSettings ?? DEFAULT_LIBRARY_SETTINGS) },
      };
      this.quizzes = [stored, ...this.quizzes];
      this.persist();
      this.error = null;
      this.pasteOpen = false;
    } catch (err) {
      this.error = describeError(err);
    }
    this.render();
  }

  private remove(id: string): void {
    this.quizzes = this.quizzes.filter((q) => q.id !== id);
    if (this.settingsFor === id) this.settingsFor = null;
    this.persist();
    this.render();
  }

  private play(id: string): void {
    this.playingId = id;
    this.render();
  }

  private backToList(): void {
    this.player?.destroy();
    this.player = null;
    this.playingId = null;
    this.render();
  }

  /* ------------------------------------------------------------ rendering */

  private render(): void {
    clear(this.root);
    this.root.classList.add("kq-root", "kq-lib-root");
    if (this.playingId) this.renderPlayer();
    else this.renderShell();
  }

  private renderPlayer(): void {
    const quiz = this.quizzes.find((q) => q.id === this.playingId);
    if (!quiz) {
      this.backToList();
      return;
    }
    this.root.append(
      el("div", { class: "kq-lib-bar" },
        el("button", { type: "button", class: "kq-btn", onclick: () => this.backToList() }, "← Library"),
      ),
    );
    const mount = el("div", { class: "kq-lib-player" });
    this.root.append(mount);
    this.player = new QuizPlayer(mount, {
      quiz: quiz.source,
      format: quiz.format,
      settings: quiz.settings,
      validate: this.options.validate,
      editableSettings: this.editableKeys(),
      views: this.options.views,
      editableViews: this.options.editableViews,
      fullscreen: this.options.fullscreen,
      now: this.options.now,
      rng: this.options.rng,
    });
    // The library owns the theme control in list view; the nested player keeps its own
    // in its header while playing (both share the same stored preference).
  }

  private renderShell(): void {
    const shell = el("div", { class: "kq-lib" });
    shell.append(
      el("div", { class: "kq-lib-head" },
        el("h2", { class: "kq-title", text: this.options.title ?? "My quizzes" }),
        this.renderHeadControls(),
      ),
    );
    shell.append(this.renderActions());
    if (this.error) shell.append(el("div", { class: "kq-error", text: this.error }));
    shell.append(this.renderList());
    this.root.append(shell);
  }

  /** ⛶ fullscreen + ☀/🌙 theme toggle, shown from the start (not only while playing). */
  private renderHeadControls(): HTMLElement {
    const controls = el("div", { class: "kq-controls" });
    controls.append(
      themeButton(() => {
        applyTheme(this.root);
        this.render();
      }),
    );
    if (this.options.fullscreen !== false && fullscreenSupported()) {
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

  private renderActions(): HTMLElement {
    const wrap = el("div", { class: "kq-lib-actions-wrap" });

    const file = el("input", {
      type: "file",
      accept: ".yaml,.yml,.json,.txt",
      class: "kq-file",
      onchange: (e: Event) => this.onFile(e),
    }) as HTMLInputElement;

    const actions = el("div", { class: "kq-lib-actions" },
      el("label", { class: "kq-btn" }, "Upload file", file),
      el("button", {
        type: "button",
        class: "kq-btn",
        onclick: () => {
          this.pasteOpen = !this.pasteOpen;
          this.promptOpen = false;
          this.error = null;
          this.render();
        },
      }, this.pasteOpen ? "Cancel" : "Paste YAML"),
      el("button", {
        type: "button",
        class: "kq-btn",
        onclick: () => {
          this.promptOpen = !this.promptOpen;
          this.pasteOpen = false;
          this.error = null;
          this.render();
        },
      }, this.promptOpen ? "Cancel" : "✨ Create with AI"),
    );
    wrap.append(actions);

    if (this.promptOpen) wrap.append(this.renderPromptTool());

    if (this.pasteOpen) {
      const textarea = el("textarea", {
        class: "kq-textarea",
        rows: "10",
        placeholder: "Paste quiz YAML here…",
      }) as HTMLTextAreaElement;
      wrap.append(
        el("div", { class: "kq-paste" },
          textarea,
          el("button", {
            type: "button",
            class: "kq-btn kq-btn-primary",
            onclick: () => this.save(textarea.value, "yaml"),
          }, "Save quiz"),
        ),
      );
    }
    return wrap;
  }

  private onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const format: "yaml" | "json" = /\.json$/i.test(file.name) ? "json" : "yaml";
    const reader = new FileReader();
    reader.onload = () => {
      this.save(String(reader.result ?? ""), format);
      input.value = "";
    };
    reader.onerror = () => {
      this.error = "Could not read the file.";
      this.render();
    };
    reader.readAsText(file);
  }

  /**
   * A small helper that assembles a ready-to-paste prompt for an LLM chat: it points
   * the model at the AI-authoring guide, takes what the learner wants to study and the
   * language they need, and produces a quiz in this format to paste back and save.
   */
  private renderPromptTool(): HTMLElement {
    const wrap = el("div", { class: "kq-ai" });
    wrap.append(
      mdEl(
        "p",
        `Paste this whole prompt into ChatGPT, Claude, Gemini… — it includes the full [format guide](${AI_GUIDE_BLOB}) inline (no link for the model to open), then asks for a quiz you can paste back and save below.`,
        "kq-ai-context",
      ),
    );

    const topic = el("textarea", {
      class: "kq-textarea",
      rows: "3",
      placeholder: "e.g. Present perfect vs past simple for B1 English learners",
    }) as HTMLTextAreaElement;
    const language = el("input", { class: "kq-text", value: "English" }) as HTMLInputElement;
    const out = el("textarea", { class: "kq-textarea kq-ai-out", readonly: true, rows: "10" }) as HTMLTextAreaElement;

    const refresh = (): void => {
      out.value = buildAiPrompt(topic.value, language.value);
    };
    topic.addEventListener("input", refresh);
    language.addEventListener("input", refresh);
    refresh();

    const copyBtn = el("button", {
      type: "button",
      class: "kq-btn kq-btn-primary",
      onclick: () => this.copyToClipboard(out.value, copyBtn),
    }, "Copy prompt") as HTMLButtonElement;

    wrap.append(
      el("label", { class: "kq-ai-field" },
        el("span", { class: "kq-ai-label" },
          el("span", { text: "What do you want to learn?" }),
        ),
        topic,
      ),
      el("label", { class: "kq-ai-field" },
        el("span", { class: "kq-ai-label" },
          el("span", { text: "Language for the questions " }),
          el("span", { class: "kq-ai-hint", text: "(the language the questions are written in)" }),
        ),
        language,
      ),
      el("label", { class: "kq-ai-field" },
        el("span", { class: "kq-ai-label", text: "Prompt to copy" }),
        out,
      ),
      el("div", { class: "kq-ai-actions" }, copyBtn),
    );
    return wrap;
  }

  private copyToClipboard(text: string, button: HTMLButtonElement): void {
    const flash = (): void => {
      button.textContent = "Copied!";
      if (typeof setTimeout === "function") {
        setTimeout(() => { button.textContent = "Copy prompt"; }, 1500);
      }
    };
    try {
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      if (nav?.clipboard?.writeText) {
        void nav.clipboard.writeText(text).then(flash, () => undefined);
        return;
      }
    } catch {
      /* fall through — clipboard may be unavailable */
    }
    flash();
  }

  private renderList(): HTMLElement {
    if (!this.quizzes.length) {
      return el("div", { class: "kq-lib-empty" },
        el("p", { text: "No saved quizzes yet. Upload a .yaml file or paste one to get started." }),
      );
    }
    const list = el("div", { class: "kq-lib-list" });
    for (const quiz of this.quizzes) list.append(this.renderItem(quiz));
    return list;
  }

  private renderItem(quiz: StoredQuiz): HTMLElement {
    const item = el("div", { class: "kq-lib-item" });
    item.append(
      el("div", { class: "kq-lib-item-row" },
        el("div", { class: "kq-lib-info" },
          el("div", { class: "kq-lib-title", text: quiz.title }),
          el("div", { class: "kq-lib-sub", text: `${quiz.count} question${quiz.count === 1 ? "" : "s"}` }),
        ),
        el("div", { class: "kq-lib-item-actions" },
          el("button", { type: "button", class: "kq-btn kq-btn-primary", onclick: () => this.play(quiz.id) }, "▶ Play"),
          el("button", {
            type: "button",
            class: "kq-icon-btn",
            title: "Settings",
            "aria-label": "Settings",
            onclick: () => {
              this.settingsFor = this.settingsFor === quiz.id ? null : quiz.id;
              this.render();
            },
          }, "⚙"),
          el("button", {
            type: "button",
            class: "kq-icon-btn",
            title: "Delete",
            "aria-label": "Delete",
            onclick: () => {
              if (confirmDelete(quiz.title)) this.remove(quiz.id);
            },
          }, "🗑"),
        ),
      ),
    );

    if (this.settingsFor === quiz.id) {
      item.append(
        buildSettingsPanel({
          keys: this.editableKeys(),
          current: quiz.settings ?? {},
          onApply: (patch) => {
            quiz.settings = { ...quiz.settings, ...patch };
            this.settingsFor = null;
            this.persist();
            this.render();
          },
          onClose: () => {
            this.settingsFor = null;
            this.render();
          },
        }),
      );
    }
    return item;
  }
}

/** Mount a quiz library into `target` (an element, a CSS selector, or a bare id). */
export function library(target: string | HTMLElement, options: LibraryOptions = {}): QuizLibrary {
  return new QuizLibrary(resolveTarget(target), options);
}

function makeId(): string {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * If the whole input is wrapped in a single Markdown fenced code block (```yaml … ```),
 * return just its inner content; otherwise return the input unchanged. Lets a learner
 * paste straight from a chat's code block without stripping the fences by hand.
 */
function stripCodeFence(source: string): string {
  const trimmed = source.trim();
  const match = /^```[^\n`]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return match ? match[1]! : source;
}

/**
 * Assemble the copy-paste LLM prompt. The full authoring guide is embedded inline (not
 * linked) so it works with any chat model — including those that cannot open a URL.
 */
function buildAiPrompt(topic: string, language: string): string {
  const subject = topic.trim() || "<describe what you want to learn>";
  const lang = language.trim() || "English";
  return [
    aiAuthoringGuide.trim(),
    "",
    "---",
    "",
    "Using the Kensai Quiz format described above, create a quiz about:",
    subject,
    "",
    `Write every prompt, answer option and explanation in ${lang}.`,
    "",
    "Rules:",
    "- Put the whole quiz inside a single ```yaml fenced code block so I can copy it cleanly",
    "  (the raw YAML must not be rendered as formatted text). If your chat can attach files,",
    "  also offer it as a downloadable `quiz.yaml`.",
    "- Output only that quiz — no explanation before or after the code block.",
    "- Add a short `explanation` to each question so I can learn from my mistakes.",
    "- Aim for 8–12 questions unless I asked for a different number above.",
  ].join("\n");
}

function describeError(err: unknown): string {
  if (err instanceof QuizValidationError) {
    const first = err.issues?.[0]?.message;
    return `Invalid quiz: ${first ?? err.message}`;
  }
  if (err instanceof Error) return `Could not load the quiz: ${err.message}`;
  return "Could not load the quiz.";
}

function confirmDelete(title: string): boolean {
  if (typeof confirm === "function") {
    return confirm(`Delete “${title}”? This only removes it from this browser.`);
  }
  return true;
}
