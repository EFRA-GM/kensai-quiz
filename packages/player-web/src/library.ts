import { loadQuiz, QuizValidationError, type ResolvedSettings } from "@kensai/quiz-core";
import { clear, el, mdEl, resolveTarget } from "./dom";
import { injectStyles } from "./styles";
import { QuizPlayer, type PlayerOptions } from "./player";
import { buildSettingsPanel, type EditableSettingKey } from "./settings-ui";
import { readJSON, writeJSON } from "./storage";
import { applyTheme, themeButton } from "./theme";
import { aiAuthoringGuide } from "./ai-guide.generated";
import { downloadBlob, slugFilename } from "./download";
import { zipSync } from "./zip";
import type { QuizResult } from "@kensai/quiz-core";
import {
  aggregateByCategory,
  attemptsFor,
  clearAttempts,
  hasTopics,
  recordAttempt,
  summarize,
  toStoredAttempt,
  weakestCategory,
  type StoredAttempt,
} from "./results";

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
  /** How many past executions to keep per quiz (older ones are dropped). Default `50`. */
  maxAttempts?: number;
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
  /** Folder this quiz lives in; absent/`null` means loose at the root. */
  folderId?: string | null;
}

/** A folder that groups quizzes (one level deep — folders never nest). */
interface StoredFolder {
  id: string;
  name: string;
  createdAt: number;
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
  private readonly foldersKey: string;
  private quizzes: StoredQuiz[];
  private folders: StoredFolder[];
  private player: QuizPlayer | null = null;
  private playingId: string | null = null;
  private settingsFor: string | null = null;
  /** The quiz whose results panel is open, or `null`. */
  private resultsFor: string | null = null;
  /** Which execution row (by `at` timestamp) is expanded in the results panel. */
  private expandedAttempt: number | null = null;
  /** When the current play began, to record attempt duration. */
  private playStartedAt: number | null = null;
  /** The folder currently being viewed; `null` means the root. */
  private currentFolderId: string | null = null;
  private pasteOpen = false;
  private promptOpen = false;
  private newFolderOpen = false;
  private error: string | null = null;

  constructor(target: HTMLElement, options: LibraryOptions = {}) {
    injectStyles();
    this.root = target;
    this.options = options;
    this.storageKey = options.storageKey ?? "kensai-quiz-library";
    this.foldersKey = `${this.storageKey}:folders`;
    this.quizzes = readJSON<StoredQuiz[]>(this.storageKey, []);
    this.folders = readJSON<StoredFolder[]>(this.foldersKey, []);
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

  private persistFolders(): void {
    writeJSON(this.foldersKey, this.folders);
  }

  /** Quizzes belonging to `folderId` (`null` = loose at the root). */
  private quizzesIn(folderId: string | null): StoredQuiz[] {
    return this.quizzes.filter((q) => (q.folderId ?? null) === folderId);
  }

  /**
   * Parse `rawSource` and build a `StoredQuiz` placed in the folder currently
   * being viewed. Throws (via `loadQuiz`) on invalid input — callers handle it.
   */
  private buildStored(rawSource: string, format: "yaml" | "json"): StoredQuiz {
    // The AI prompt asks for the quiz inside a ```yaml block; tolerate a pasted fence.
    const source = stripCodeFence(rawSource);
    const quiz = loadQuiz(source, { format, validate: this.options.validate });
    return {
      id: makeId(),
      title: quiz.metadata.title,
      count: quiz.questions.length,
      source,
      format,
      savedAt: Date.now(),
      folderId: this.currentFolderId,
      settings: { ...(this.options.defaultSettings ?? DEFAULT_LIBRARY_SETTINGS) },
    };
  }

  private save(rawSource: string, format: "yaml" | "json"): void {
    try {
      const stored = this.buildStored(rawSource, format);
      this.quizzes = [stored, ...this.quizzes];
      this.persist();
      this.error = null;
      this.pasteOpen = false;
    } catch (err) {
      this.error = describeError(err);
    }
    this.render();
  }

  /**
   * Save several sources in one batch (e.g. a multi-file upload): parse each,
   * prepend the successes together, and summarize any failures — all with a
   * single persist + render.
   */
  private saveMany(entries: { source: string; format: "yaml" | "json" }[]): void {
    const added: StoredQuiz[] = [];
    let failed = 0;
    let firstError: string | null = null;
    for (const { source, format } of entries) {
      try {
        added.push(this.buildStored(source, format));
      } catch (err) {
        failed += 1;
        if (!firstError) firstError = describeError(err);
      }
    }
    if (added.length) {
      // Keep upload order (first file ends up on top), newest batch before older quizzes.
      this.quizzes = [...added, ...this.quizzes];
      this.persist();
    }
    if (failed) {
      this.error = added.length
        ? `${added.length} added, ${failed} failed: ${firstError}`
        : firstError;
    } else {
      this.error = null;
    }
    this.render();
  }

  private remove(id: string): void {
    this.quizzes = this.quizzes.filter((q) => q.id !== id);
    if (this.settingsFor === id) this.settingsFor = null;
    if (this.resultsFor === id) this.resultsFor = null;
    clearAttempts(this.storageKey, id); // don't leave orphaned history behind
    this.persist();
    this.render();
  }

  /** Current time, honoring an injected clock for tests. */
  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** Persist the finished attempt's result as one execution record. */
  private onAttemptFinished(quizId: string, result: QuizResult): void {
    const at = this.now();
    const durationMs = this.playStartedAt != null ? at - this.playStartedAt : undefined;
    recordAttempt(
      this.storageKey,
      quizId,
      toStoredAttempt(result, at, durationMs),
      this.options.maxAttempts ?? 50,
    );
    // The player is showing its own results screen; the list refreshes on return.
  }

  private moveQuiz(id: string, folderId: string | null): void {
    const quiz = this.quizzes.find((q) => q.id === id);
    if (!quiz) return;
    quiz.folderId = folderId;
    this.persist();
    this.render();
  }

  /* --------------------------------------------------------------- folders */

  private addFolder(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.folders = [...this.folders, { id: makeId(), name: trimmed, createdAt: Date.now() }];
    this.persistFolders();
    this.newFolderOpen = false;
    this.error = null;
    this.render();
  }

  private renameFolder(id: string): void {
    const folder = this.folders.find((f) => f.id === id);
    if (!folder || typeof prompt !== "function") return;
    const name = prompt("Rename folder", folder.name);
    const trimmed = name?.trim();
    if (!trimmed) return;
    folder.name = trimmed;
    this.persistFolders();
    this.render();
  }

  /** Delete a folder; its quizzes are moved back to the root, not deleted. */
  private deleteFolder(id: string): void {
    for (const quiz of this.quizzes) {
      if (quiz.folderId === id) quiz.folderId = null;
    }
    this.folders = this.folders.filter((f) => f.id !== id);
    if (this.currentFolderId === id) this.currentFolderId = null;
    this.persist();
    this.persistFolders();
    this.render();
  }

  private openFolder(id: string | null): void {
    this.currentFolderId = id;
    this.settingsFor = null;
    this.pasteOpen = false;
    this.promptOpen = false;
    this.newFolderOpen = false;
    this.error = null;
    this.render();
  }

  /* -------------------------------------------------------------- download */

  private downloadQuiz(quiz: StoredQuiz): void {
    const ext = quiz.format === "json" ? "json" : "yaml";
    const mime = quiz.format === "json" ? "application/json" : "text/yaml";
    downloadBlob(`${slugFilename(quiz.title)}.${ext}`, quiz.source, mime);
  }

  private downloadFolderZip(folder: StoredFolder): void {
    const quizzes = this.quizzesIn(folder.id);
    if (!quizzes.length) return;
    const encoder = new TextEncoder();
    const used = new Set<string>();
    const files = quizzes.map((quiz) => {
      const ext = quiz.format === "json" ? "json" : "yaml";
      let stem = slugFilename(quiz.title);
      let name = `${stem}.${ext}`;
      for (let n = 1; used.has(name); n++) name = `${stem}-${n}.${ext}`;
      used.add(name);
      return { name, data: encoder.encode(quiz.source) };
    });
    downloadBlob(`${slugFilename(folder.name, "folder")}.zip`, zipSync(files), "application/zip");
  }

  private play(id: string): void {
    this.playingId = id;
    this.playStartedAt = this.now();
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
    const quizId = quiz.id;
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
      onFinish: (result) => this.onAttemptFinished(quizId, result),
    });
    // The library owns the theme control in list view; the nested player keeps its own
    // in its header while playing (both share the same stored preference).
  }

  private renderShell(): void {
    const shell = el("div", { class: "kq-lib" });
    shell.append(
      el("div", { class: "kq-lib-head" },
        this.renderHeading(),
        this.renderHeadControls(),
      ),
    );
    shell.append(this.renderActions());
    if (this.error) shell.append(el("div", { class: "kq-error", text: this.error }));
    shell.append(this.renderList());
    this.root.append(shell);
  }

  /** The title at the root, or a `root ▸ folder` breadcrumb inside a folder. */
  private renderHeading(): HTMLElement {
    const rootTitle = this.options.title ?? "My quizzes";
    const folder = this.currentFolderId
      ? this.folders.find((f) => f.id === this.currentFolderId)
      : null;
    if (!folder) return el("h2", { class: "kq-title", text: rootTitle });
    return el("div", { class: "kq-crumbs" },
      el("button", {
        type: "button",
        class: "kq-crumb-link",
        onclick: () => this.openFolder(null),
      }, rootTitle),
      el("span", { class: "kq-crumb-sep", text: "▸" }),
      el("h2", { class: "kq-title kq-crumb-current", text: folder.name }),
    );
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
      multiple: true,
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
          this.newFolderOpen = false;
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
          this.newFolderOpen = false;
          this.error = null;
          this.render();
        },
      }, this.promptOpen ? "Cancel" : "✨ Create with AI"),
    );

    // Folders live at the root only (one level deep), so the "New folder" control
    // shows there; inside a folder we offer a one-click ZIP download instead.
    if (this.currentFolderId === null) {
      actions.append(
        el("button", {
          type: "button",
          class: "kq-btn",
          onclick: () => {
            this.newFolderOpen = !this.newFolderOpen;
            this.pasteOpen = false;
            this.promptOpen = false;
            this.error = null;
            this.render();
          },
        }, this.newFolderOpen ? "Cancel" : "📁 New folder"),
      );
    } else {
      const folder = this.folders.find((f) => f.id === this.currentFolderId);
      if (folder && this.quizzesIn(folder.id).length) {
        actions.append(
          el("button", {
            type: "button",
            class: "kq-btn",
            onclick: () => this.downloadFolderZip(folder),
          }, "⬇ Download folder (.zip)"),
        );
      }
    }
    wrap.append(actions);

    if (this.newFolderOpen) {
      const name = el("input", {
        class: "kq-text",
        placeholder: "Folder name",
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === "Enter") this.addFolder(name.value);
        },
      }) as HTMLInputElement;
      wrap.append(
        el("div", { class: "kq-paste" },
          name,
          el("button", {
            type: "button",
            class: "kq-btn kq-btn-primary",
            onclick: () => this.addFolder(name.value),
          }, "Create folder"),
        ),
      );
    }

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
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    Promise.all(files.map((f) => readFileText(f))).then(
      (entries) => {
        this.saveMany(entries);
        input.value = "";
      },
      () => {
        this.error = "Could not read one of the files.";
        input.value = "";
        this.render();
      },
    );
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
    // Inside a folder: just its quizzes (with a back-to-root control).
    if (this.currentFolderId !== null) {
      const quizzes = this.quizzesIn(this.currentFolderId);
      if (!quizzes.length) {
        return el("div", { class: "kq-lib-empty" },
          el("p", { text: "This folder is empty. Upload or paste a quiz to add it here." }),
        );
      }
      const list = el("div", { class: "kq-lib-list" });
      for (const quiz of quizzes) list.append(this.renderItem(quiz));
      return list;
    }

    // Root: folders first, then loose quizzes.
    const loose = this.quizzesIn(null);
    if (!this.folders.length && !loose.length) {
      return el("div", { class: "kq-lib-empty" },
        el("p", { text: "No saved quizzes yet. Upload a .yaml file or paste one to get started." }),
      );
    }
    const list = el("div", { class: "kq-lib-list" });
    for (const folder of this.folders) list.append(this.renderFolder(folder));
    for (const quiz of loose) list.append(this.renderItem(quiz));
    return list;
  }

  private renderFolder(folder: StoredFolder): HTMLElement {
    const count = this.quizzesIn(folder.id).length;
    return el("div", { class: "kq-lib-item kq-folder-item" },
      el("div", { class: "kq-lib-item-row" },
        el("button", {
          type: "button",
          class: "kq-folder-open",
          onclick: () => this.openFolder(folder.id),
        },
          el("span", { class: "kq-folder-icon", text: "📁" }),
          el("div", { class: "kq-lib-info" },
            el("div", { class: "kq-lib-title", text: folder.name }),
            el("div", { class: "kq-lib-sub", text: `${count} quiz${count === 1 ? "" : "zes"}` }),
          ),
        ),
        el("div", { class: "kq-lib-item-actions" },
          el("button", {
            type: "button",
            class: "kq-icon-btn",
            title: "Download folder (.zip)",
            "aria-label": "Download folder as zip",
            disabled: count === 0,
            onclick: () => this.downloadFolderZip(folder),
          }, "⬇"),
          el("button", {
            type: "button",
            class: "kq-icon-btn",
            title: "Rename folder",
            "aria-label": "Rename folder",
            onclick: () => this.renameFolder(folder.id),
          }, "✎"),
          el("button", {
            type: "button",
            class: "kq-icon-btn",
            title: "Delete folder",
            "aria-label": "Delete folder",
            onclick: () => {
              if (confirmDeleteFolder(folder.name, count)) this.deleteFolder(folder.id);
            },
          }, "🗑"),
        ),
      ),
    );
  }

  private renderItem(quiz: StoredQuiz): HTMLElement {
    // Title/count on top, actions on their own row below — so a long title never
    // gets crowded or truncated behind the buttons (matters most on mobile).
    const item = el("div", { class: "kq-lib-item" });
    item.append(
      el("div", { class: "kq-lib-info" },
        el("div", { class: "kq-lib-title", text: quiz.title }),
        el("div", { class: "kq-lib-sub", text: this.subLine(quiz) }),
      ),
      el("div", { class: "kq-lib-item-actions kq-lib-actions-row" },
        el("button", { type: "button", class: "kq-btn kq-btn-primary", onclick: () => this.play(quiz.id) }, "▶ Play"),
        this.renderMoveSelect(quiz),
        el("button", {
          type: "button",
          class: "kq-icon-btn",
          title: "View results",
          "aria-label": "View results",
          onclick: () => {
            this.resultsFor = this.resultsFor === quiz.id ? null : quiz.id;
            this.expandedAttempt = null;
            this.render();
          },
        }, "📊"),
        el("button", {
          type: "button",
          class: "kq-icon-btn",
          title: "Download quiz",
          "aria-label": "Download quiz",
          onclick: () => this.downloadQuiz(quiz),
        }, "⬇"),
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
    );

    if (this.resultsFor === quiz.id) item.append(this.renderResultsPanel(quiz));

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

  /** Sub-title line: question count, plus a play summary once there is history. */
  private subLine(quiz: StoredQuiz): string {
    const questions = `${quiz.count} question${quiz.count === 1 ? "" : "s"}`;
    const summary = summarize(attemptsFor(this.storageKey, quiz.id));
    if (!summary.count) return questions;
    const plays = `${summary.count} attempt${summary.count === 1 ? "" : "s"}`;
    return `${questions} · avg ${summary.averagePct}% · ${plays}`;
  }

  /** The per-quiz results panel: summary, weakest topic, and each execution. */
  private renderResultsPanel(quiz: StoredQuiz): HTMLElement {
    const panel = el("div", { class: "kq-results-panel" });
    const attempts = attemptsFor(this.storageKey, quiz.id);

    if (!attempts.length) {
      panel.append(
        el("p", { class: "kq-results-empty", text: "No attempts yet. Play the quiz to record your results." }),
      );
      return panel;
    }

    const summary = summarize(attempts);
    panel.append(
      el("div", { class: "kq-results-summary" },
        el("span", { text: `${summary.count} attempt${summary.count === 1 ? "" : "s"}` }),
        el("span", { text: `avg ${summary.averagePct}%` }),
        el("span", { text: `best ${summary.bestPct}%` }),
        el("span", { text: `last ${summary.lastPct}%` }),
      ),
    );

    // Weakest topic across the learner's whole history for this quiz.
    const aggregate = aggregateByCategory(attempts);
    if (hasTopics(aggregate)) {
      const weakest = weakestCategory(aggregate);
      if (weakest) {
        const name = weakest.label ?? weakest.categoryId ?? "Uncategorized";
        panel.append(
          el("div", { class: "kq-focus" },
            el("span", { class: "kq-focus-label", text: "Focus on: " }),
            el("span", { text: `${name} (${Math.round(weakest.accuracy * 100)}%)` }),
          ),
        );
      }
    }

    // Executions, newest first; a row expands to its per-topic breakdown.
    const list = el("div", { class: "kq-attempt-list" });
    for (const attempt of [...attempts].reverse()) {
      list.append(this.renderAttemptRow(attempt));
    }
    panel.append(list);

    panel.append(
      el("div", { class: "kq-results-actions" },
        el("button", {
          type: "button",
          class: "kq-btn",
          onclick: () => {
            if (confirmClearHistory(quiz.title)) {
              clearAttempts(this.storageKey, quiz.id);
              this.expandedAttempt = null;
              this.render();
            }
          },
        }, "Clear history"),
      ),
    );
    return panel;
  }

  private renderAttemptRow(attempt: StoredAttempt): HTMLElement {
    const pct = Math.round(attempt.ratio * 100);
    const expanded = this.expandedAttempt === attempt.at;
    const wrap = el("div", { class: "kq-attempt" });

    wrap.append(
      el("button", {
        type: "button",
        class: "kq-attempt-row",
        "aria-expanded": expanded ? "true" : "false",
        onclick: () => {
          this.expandedAttempt = expanded ? null : attempt.at;
          this.render();
        },
      },
        el("span", { class: "kq-attempt-date", text: formatDate(attempt.at) }),
        el("span", { class: "kq-attempt-score" },
          attempt.passed !== null
            ? el("span", { class: `kq-badge ${attempt.passed ? "kq-pass" : "kq-fail"}`, text: attempt.passed ? "Passed" : "Not passed" })
            : null,
          el("span", { text: `${pct}%` }),
        ),
      ),
    );

    if (expanded && hasTopics(attempt.byCategory)) {
      const table = el("table", { class: "kq-cat-table kq-attempt-detail" });
      table.append(
        el("thead", {}, el("tr", {}, el("th", { text: "Topic" }), el("th", { text: "Score" }))),
      );
      const tbody = el("tbody");
      for (const c of attempt.byCategory) {
        const name = c.label ?? c.categoryId ?? "Uncategorized";
        tbody.append(
          el("tr", {},
            el("td", { text: name }),
            el("td", { text: `${c.correct}/${c.total} (${Math.round(c.accuracy * 100)}%)` }),
          ),
        );
      }
      table.append(tbody);
      wrap.append(table);
    }
    return wrap;
  }

  /** A `Move to…` dropdown listing the root plus every folder. */
  private renderMoveSelect(quiz: StoredQuiz): HTMLElement {
    const current = quiz.folderId ?? "";
    const select = el("select", {
      class: "kq-select kq-lib-move",
      title: "Move to folder",
      "aria-label": "Move to folder",
      onchange: (e: Event) => {
        const value = (e.target as HTMLSelectElement).value;
        this.moveQuiz(quiz.id, value || null);
      },
    }) as HTMLSelectElement;
    select.append(el("option", { value: "", selected: current === "" }, "📂 Root"));
    for (const folder of this.folders) {
      select.append(
        el("option", { value: folder.id, selected: current === folder.id }, `📁 ${folder.name}`),
      );
    }
    return select;
  }
}

/** Mount a quiz library into `target` (an element, a CSS selector, or a bare id). */
export function library(target: string | HTMLElement, options: LibraryOptions = {}): QuizLibrary {
  return new QuizLibrary(resolveTarget(target), options);
}

function makeId(): string {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Read a picked file as text, resolving with its source and inferred format. */
function readFileText(file: File): Promise<{ source: string; format: "yaml" | "json" }> {
  const format: "yaml" | "json" = /\.json$/i.test(file.name) ? "json" : "yaml";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ source: String(reader.result ?? ""), format });
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

/** Human-friendly date+time for an execution row (locale-aware, best-effort). */
function formatDate(at: number): string {
  try {
    return new Date(at).toLocaleString();
  } catch {
    return new Date(at).toISOString();
  }
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

function confirmDeleteFolder(name: string, count: number): boolean {
  if (typeof confirm !== "function") return true;
  const note = count
    ? ` Its ${count} quiz${count === 1 ? "" : "zes"} will be moved back out of the folder, not deleted.`
    : "";
  return confirm(`Delete folder “${name}”?${note}`);
}

function confirmClearHistory(title: string): boolean {
  if (typeof confirm === "function") {
    return confirm(`Clear all saved results for “${title}”? This can't be undone.`);
  }
  return true;
}
