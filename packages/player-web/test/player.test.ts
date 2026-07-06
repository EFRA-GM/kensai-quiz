import { beforeEach, describe, expect, it, vi } from "vitest";
import { init, library, QuizLibrary, QuizPlayer, version } from "../src/index";
import type { Quiz } from "@kensai/quiz-core";

const quiz: Quiz = {
  schema_version: "0.1",
  metadata: { title: "Player Test", description: "A tiny quiz." },
  categories: [{ id: "g", label: "General" }],
  questions: [
    { id: "a", type: "true_false", category: "g", prompt: "1 is odd.", answer: true },
    { id: "b", type: "true_false", category: "g", prompt: "2 is odd.", answer: false, explanation: "2 is even." },
    {
      id: "c",
      type: "choice",
      category: "g",
      prompt: "Pick B.",
      options: [{ id: "x", text: "A" }, { id: "y", text: "B" }],
      answer: ["y"],
    },
  ],
};

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.id = "quiz";
  document.body.append(host);
});

const clickText = (root: HTMLElement, text: string): void => {
  const btn = [...root.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!btn) throw new Error(`button "${text}" not found`);
  (btn as HTMLButtonElement).click();
};

const setRadio = (root: HTMLElement, value: string): void => {
  const input = root.querySelector<HTMLInputElement>(`input[value="${value}"]`);
  if (!input) throw new Error(`input value="${value}" not found`);
  input.checked = true;
};

const gear = (root: HTMLElement): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>('.kq-icon-btn[aria-label="Settings"]');

describe("init", () => {
  it("exposes a version and resolves targets by id, selector, and element", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(init("quiz", { quiz })).toBeInstanceOf(QuizPlayer);
    expect(init("#quiz", { quiz })).toBeInstanceOf(QuizPlayer);
    expect(init(host, { quiz })).toBeInstanceOf(QuizPlayer);
  });

  it("throws for a missing target", () => {
    expect(() => init("#nope", { quiz })).toThrow(/not found/);
  });

  it("renders the header and questions", () => {
    init(host, { quiz });
    expect(host.querySelector(".kq-title")?.textContent).toBe("Player Test");
    // default navigation is "all" → every question is on the page
    expect(host.querySelectorAll(".kq-question").length).toBe(3);
  });
});

describe("all-navigation flow (default)", () => {
  it("scores answers and shows results with per-category stats", () => {
    const onFinish = vi.fn();
    init(host, { quiz, onFinish });

    setRadio(host, "true"); // q a → correct
    // leave q b unanswered
    const cInputs = host.querySelectorAll<HTMLInputElement>('input[value="y"]');
    cInputs[0]!.checked = true; // q c → correct

    clickText(host, "Finish");

    expect(onFinish).toHaveBeenCalledOnce();
    const result = onFinish.mock.calls[0]![0];
    expect(result.score).toBe(2);
    expect(result.maxScore).toBe(3);
    expect(host.querySelector(".kq-score")?.textContent).toBe("67%");
    expect(host.querySelector(".kq-review")).not.toBeNull();
  });
});

describe("sequential + immediate feedback", () => {
  it("checks a question, reveals feedback, then advances to results", () => {
    const player = init(host, {
      quiz,
      settings: { navigation: "sequential", feedback: "immediate" },
    });

    // Q1: answer correctly and Check
    setRadio(host, "true");
    clickText(host, "Check");
    expect(host.querySelector(".kq-feedback.kq-is-correct")).not.toBeNull();

    clickText(host, "Next");
    // Q2: answer wrong, Check → feedback shows the explanation
    setRadio(host, "true"); // correct is false
    clickText(host, "Check");
    expect(host.querySelector(".kq-feedback.kq-is-incorrect")).not.toBeNull();
    expect(host.textContent).toContain("2 is even.");

    clickText(host, "Next");
    // Q3
    const y = host.querySelector<HTMLInputElement>('input[value="y"]')!;
    y.checked = true;
    clickText(host, "Check");
    clickText(host, "Finish");

    expect(player.quiz?.questions.length).toBe(3);
    expect(host.querySelector(".kq-score")?.textContent).toBe("67%");
  });
});

describe("deferred / imperative API", () => {
  it("starts empty and renders after setQuiz", () => {
    const player = init(host);
    expect(host.querySelector(".kq-empty")).not.toBeNull();
    expect(player.quiz).toBeNull();

    player.setQuiz(quiz);
    expect(host.querySelector(".kq-empty")).toBeNull();
    expect(host.querySelectorAll(".kq-question").length).toBe(3);
    expect(player.quiz?.questions.length).toBe(3);
  });

  it("setQuestions wraps a bare question list", () => {
    const player = init(host);
    player.setQuestions([{ id: "a", type: "true_false", prompt: "1 is odd.", answer: true }]);
    expect(host.querySelectorAll(".kq-question").length).toBe(1);
    expect(host.querySelector(".kq-title")?.textContent).toBe("Quiz");
  });

  it("setSettings switches navigation and re-renders", () => {
    const player = init(host, { quiz });
    expect(host.querySelectorAll(".kq-question").length).toBe(3); // "all" mode
    player.setSettings({ navigation: "sequential" });
    expect(host.querySelector(".kq-progress")?.textContent).toBe("Question 1 of 3");
  });
});

describe("editable settings gear", () => {
  it("shows the ⚙ gear only when editableSettings is provided", () => {
    init(host, { quiz });
    expect(gear(host)).toBeNull();

    init(host, { quiz, editableSettings: ["feedback"] });
    expect(gear(host)).not.toBeNull();
  });

  it("opens a panel and applies a settings change", () => {
    init(host, { quiz, editableSettings: ["navigation"] });
    gear(host)!.click();
    const panel = host.querySelector(".kq-settings-panel");
    expect(panel).not.toBeNull();

    const select = panel!.querySelector<HTMLSelectElement>("select")!;
    select.value = "sequential";
    clickText(host, "Apply");

    expect(host.querySelector(".kq-settings-panel")).toBeNull(); // closed after apply
    expect(host.querySelector(".kq-progress")?.textContent).toBe("Question 1 of 3");
  });

  it("the unified 'shuffle' toggle drives both question order and option shuffling", () => {
    const player = init(host, { quiz, editableSettings: ["shuffle"] });
    gear(host)!.click();
    const panel = host.querySelector(".kq-settings-panel")!;
    expect(panel.querySelector(".kq-settings-label")?.textContent).toBe("Shuffle questions & options");

    const cb = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    cb.checked = true;
    clickText(host, "Apply");

    const s = player.getSettings()!;
    expect(s.order).toBe("random");
    expect(s.shuffle_options).toBe(true);
  });

  it("shows and applies the time limit in minutes (stored as seconds)", () => {
    const player = init(host, { quiz, settings: { time_limit: 90 }, editableSettings: ["time_limit"] });
    gear(host)!.click();
    const num = host.querySelector<HTMLInputElement>('.kq-settings-panel input[type="number"]')!;
    expect(num.value).toBe("1.5"); // 90s → 1.5 min

    num.value = "2";
    clickText(host, "Apply");
    expect(player.getSettings()?.time_limit).toBe(120); // 2 min → 120s
  });
});

describe("fill_blank inline rendering", () => {
  const fillQuiz: Quiz = {
    schema_version: "0.1",
    metadata: { title: "Fill" },
    questions: [
      {
        id: "f",
        type: "fill_blank",
        prompt: "I {{1}} coffee but she {{2}} tea.",
        blanks: {
          "1": { accept: ["drink"] },
          "2": { options: [{ id: "x", text: "drink" }, { id: "y", text: "drinks" }], answer: "y" },
        },
      },
    ],
  } as unknown as Quiz;

  it("embeds inputs inline and shows no raw {{ }} placeholders", () => {
    init(host, { quiz: fillQuiz, settings: { navigation: "sequential" } });
    const inline = host.querySelector(".kq-fill-inline")!;
    expect(inline).not.toBeNull();
    expect(inline.textContent).not.toContain("{{");
    // one free-text input + one select, placed within the sentence
    expect(inline.querySelectorAll("input").length).toBe(1);
    expect(inline.querySelectorAll("select").length).toBe(1);
    // and no duplicate prompt heading for this type
    expect(host.querySelector(".kq-prompt")).toBeNull();
  });
});

describe("timer", () => {
  it("auto-finishes when the injected clock passes the limit", () => {
    let clock = 0;
    const player = init(host, {
      quiz,
      settings: { navigation: "sequential", time_limit: 30 },
      now: () => clock,
    });
    expect(host.querySelector(".kq-timer")?.textContent).toBe("00:30");

    clock = 31_000;
    // Any interaction enforces the limit and finishes the attempt.
    player["attempt"].answer(true);
    expect(host.querySelector(".kq-score")).not.toBeNull();
  });
});

describe("restart", () => {
  it("clears answers and returns to the first screen", () => {
    const player = init(host, { quiz, settings: { navigation: "sequential" } });
    setRadio(host, "true");
    clickText(host, "Next");
    player.restart();
    expect(host.querySelector(".kq-progress")?.textContent).toBe("Question 1 of 3");
  });
});

describe("shuffle answer options", () => {
  const optQuiz: Quiz = {
    schema_version: "0.1",
    metadata: { title: "Options" },
    questions: [
      {
        id: "shuf",
        type: "choice",
        prompt: "Pick",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
          { id: "c", text: "C" },
          { id: "d", text: "All of the above" },
        ],
        answer: ["d"],
      },
      {
        id: "locked",
        type: "choice",
        prompt: "Ordered",
        shuffle_options: false,
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
          { id: "c", text: "All of the above" },
        ],
        answer: ["c"],
      },
    ],
  } as unknown as Quiz;

  const optionIds = (root: HTMLElement, sel: string): string[] =>
    [...root.querySelectorAll<HTMLElement>(`.kq-question[data-type="choice"] ${sel} input.kq-input`)].map(
      (i) => (i as HTMLInputElement).value,
    );

  it("renders options in authored order by default", () => {
    init(host, { quiz: optQuiz, settings: { navigation: "all" } });
    // first question, in document order
    expect(optionIds(host, "").slice(0, 4)).toEqual(["a", "b", "c", "d"]);
  });

  it("reorders options when shuffle_options is on, but not the opt-out question", () => {
    // rng: () => 0 rotates the array deterministically
    init(host, {
      quiz: optQuiz,
      settings: { navigation: "all", shuffle_options: true },
      rng: () => 0,
    });
    const questions = host.querySelectorAll<HTMLElement>('.kq-question[data-type="choice"]');
    const first = [...questions[0]!.querySelectorAll<HTMLInputElement>("input.kq-input")].map((i) => i.value);
    const second = [...questions[1]!.querySelectorAll<HTMLInputElement>("input.kq-input")].map((i) => i.value);

    expect(first).not.toEqual(["a", "b", "c", "d"]); // shuffled
    expect([...first].sort()).toEqual(["a", "b", "c", "d"]); // still all present
    expect(second).toEqual(["a", "b", "c"]); // opt-out keeps authored order
  });
});

describe("keyboard", () => {
  const pressEnter = (node: Element): void => {
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  };

  const textQuiz: Quiz = {
    schema_version: "0.1",
    metadata: { title: "Keys" },
    questions: [
      {
        id: "f",
        type: "fill_blank",
        prompt: "{{1}} and {{2}}",
        blanks: { "1": { accept: ["a"] }, "2": { accept: ["b"] } },
      },
      { id: "s", type: "short_answer", prompt: "Opposite of fast?", accept: ["slow"] },
      { id: "t", type: "true_false", prompt: "OK?", answer: true },
    ],
  } as unknown as Quiz;

  it("Enter moves between blanks, then advances on the last field", () => {
    init(host, { quiz: textQuiz, settings: { navigation: "sequential" } });
    const inputs = host.querySelectorAll<HTMLInputElement>("input.kq-text");
    expect(inputs.length).toBe(2);
    expect(document.activeElement).toBe(inputs[0]); // first blank auto-focused

    inputs[0]!.value = "a";
    pressEnter(inputs[0]!);
    expect(document.activeElement).toBe(inputs[1]); // Enter moved to the next blank

    inputs[1]!.value = "b";
    pressEnter(inputs[1]!);
    expect(host.querySelector(".kq-progress")?.textContent).toBe("Question 2 of 3");
  });

  it("Enter in a single text field fires the Next button", () => {
    init(host, { quiz: textQuiz, settings: { navigation: "sequential" } });
    // advance to the short_answer question
    (host.querySelector("input.kq-text") as HTMLInputElement).value = "a";
    clickText(host, "Next");

    const input = host.querySelector("input.kq-text") as HTMLInputElement;
    input.value = "slow";
    pressEnter(input);
    expect(host.querySelector(".kq-progress")?.textContent).toBe("Question 3 of 3");
  });
});

describe("theme toggle", () => {
  const themeBtn = (root: HTMLElement): HTMLButtonElement | undefined =>
    [...root.querySelectorAll("button")].find((b) => /theme/i.test(b.getAttribute("aria-label") ?? "")) as
      | HTMLButtonElement
      | undefined;

  beforeEach(() => localStorage.clear());

  it("defaults to light and toggles to dark, persisting the choice", () => {
    init(host, { quiz });
    expect(host.classList.contains("kq-theme-light")).toBe(true);

    const btn = themeBtn(host)!;
    expect(btn).toBeTruthy();
    btn.click();

    expect(host.classList.contains("kq-theme-dark")).toBe(true);
    expect(host.classList.contains("kq-theme-light")).toBe(false);
    expect(localStorage.getItem("kensai-quiz-theme")).toContain("dark");
  });

  it("can be hidden with theme:false", () => {
    init(host, { quiz, theme: false });
    expect(themeBtn(host)).toBeUndefined();
  });
});

describe("library (playground)", () => {
  const yaml = [
    'schema_version: "0.1"',
    "metadata:",
    '  title: "Saved One"',
    "questions:",
    "  - type: true_false",
    '    prompt: "1 is odd."',
    "    answer: true",
  ].join("\n");

  beforeEach(() => localStorage.clear());

  it("renders an empty shell, then persists a pasted quiz", () => {
    const lib = library(host, {});
    expect(lib).toBeInstanceOf(QuizLibrary);
    expect(host.querySelector(".kq-lib-empty")).not.toBeNull();

    clickText(host, "Paste YAML");
    host.querySelector<HTMLTextAreaElement>("textarea")!.value = yaml;
    clickText(host, "Save quiz");

    expect(host.querySelector(".kq-lib-title")?.textContent).toBe("Saved One");
    expect(host.querySelector(".kq-lib-sub")?.textContent).toBe("1 question");
    expect(localStorage.getItem("kensai-quiz-library")).toContain("Saved One");
  });

  it("plays a saved quiz and returns to the list", () => {
    library(host, {});
    clickText(host, "Paste YAML");
    host.querySelector<HTMLTextAreaElement>("textarea")!.value = yaml;
    clickText(host, "Save quiz");

    clickText(host, "▶ Play");
    expect(host.querySelector(".kq-question")).not.toBeNull();

    clickText(host, "← Library");
    expect(host.querySelector(".kq-lib-list")).not.toBeNull();
  });

  it("defaults added quizzes to one-at-a-time + immediate feedback", () => {
    const twoQ = [
      'schema_version: "0.1"',
      "metadata:",
      '  title: "Two"',
      "questions:",
      "  - type: true_false",
      '    prompt: "1 is odd."',
      "    answer: true",
      "  - type: true_false",
      '    prompt: "2 is odd."',
      "    answer: false",
    ].join("\n");

    library(host, {}).addQuiz(twoQ);
    expect(localStorage.getItem("kensai-quiz-library")).toContain('"navigation":"sequential"');

    clickText(host, "▶ Play");
    // sequential → one question with a progress counter …
    expect(host.querySelector(".kq-progress")?.textContent).toBe("Question 1 of 2");
    // … and immediate feedback → a Check button is present.
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Check")).toBe(true);
  });

  it("shows an error for an invalid quiz and saves nothing", () => {
    library(host, {});
    clickText(host, "Paste YAML");
    host.querySelector<HTMLTextAreaElement>("textarea")!.value = "nope: not a quiz";
    clickText(host, "Save quiz");

    expect(host.querySelector(".kq-error")).not.toBeNull();
    expect(host.querySelector(".kq-lib-item")).toBeNull();
  });

  it("reloads saved quizzes from storage on construction", () => {
    library(host, {}).addQuiz(yaml);
    // A fresh library over the same storage key should see the saved quiz.
    const second = document.createElement("div");
    document.body.append(second);
    library(second, {});
    expect(second.querySelector(".kq-lib-title")?.textContent).toBe("Saved One");
  });

  it("builds a copy-paste AI prompt from the topic and language", () => {
    library(host, {});
    clickText(host, "✨ Create with AI");

    const topic = host.querySelector<HTMLTextAreaElement>(".kq-ai .kq-textarea:not(.kq-ai-out)")!;
    const lang = host.querySelector<HTMLInputElement>(".kq-ai input.kq-text")!;
    const out = host.querySelector<HTMLTextAreaElement>(".kq-ai-out")!;

    // The full authoring guide is embedded inline so the model needs no URL.
    expect(out.value).toContain("AI Authoring Guide");
    expect(out.value).toContain("schema_version");

    topic.value = "Past simple vs present perfect";
    topic.dispatchEvent(new Event("input", { bubbles: true }));
    lang.value = "Español";
    lang.dispatchEvent(new Event("input", { bubbles: true }));

    expect(out.value).toContain("Past simple vs present perfect");
    expect(out.value).toContain("Español");
    // Asks for the quiz in a fenced code block so the chat won't render it as text.
    expect(out.value).toContain("```yaml");
  });

  it("tolerates YAML pasted inside a ```yaml code fence", () => {
    library(host, {});
    clickText(host, "Paste YAML");
    host.querySelector<HTMLTextAreaElement>("textarea")!.value = "```yaml\n" + yaml + "\n```";
    clickText(host, "Save quiz");

    expect(host.querySelector(".kq-error")).toBeNull();
    expect(host.querySelector(".kq-lib-title")?.textContent).toBe("Saved One");
  });

  it("shows a fullscreen toggle in the list view when the browser supports it", () => {
    const original = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled");
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    try {
      library(host, {});
      const fs = [...host.querySelectorAll("button")].find(
        (b) => b.getAttribute("aria-label") === "Toggle fullscreen",
      );
      expect(fs).toBeTruthy();
    } finally {
      if (original) Object.defineProperty(document, "fullscreenEnabled", original);
      else Object.defineProperty(document, "fullscreenEnabled", { value: undefined, configurable: true });
    }
  });
});
