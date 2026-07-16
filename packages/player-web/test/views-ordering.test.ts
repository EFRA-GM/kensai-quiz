import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/index";
import type { Quiz } from "@kensai/quiz-core";

const orderingQuiz: Quiz = {
  schema_version: "0.1",
  metadata: { id: "ord", title: "Ordering Test" },
  questions: [
    {
      id: "o1",
      type: "ordering",
      prompt: "Put the words in order.",
      items: [
        { id: "a", text: "always" },
        { id: "b", text: "She" },
        { id: "c", text: "coffee" },
        { id: "d", text: "drinks" },
      ],
      answer: ["b", "a", "d", "c"],
    },
  ],
} as unknown as Quiz;

let host: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
});

const clickText = (root: HTMLElement, text: string): void => {
  const btn = [...root.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!btn) throw new Error(`button "${text}" not found`);
  btn.click();
};

const chip = (root: HTMLElement, text: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll<HTMLButtonElement>(".kq-chip")].find(
    (c) => c.textContent === text,
  );
  if (!found) throw new Error(`chip "${text}" not found`);
  return found;
};

const viewBtn = (root: HTMLElement, label: string): HTMLButtonElement => {
  const btn = [...root.querySelectorAll<HTMLButtonElement>(".kq-view-btn")].find(
    (b) => b.textContent === label,
  );
  if (!btn) throw new Error(`view button "${label}" not found`);
  return btn;
};

/** The words currently in the answer line, in order. */
const answerWords = (root: HTMLElement): string[] =>
  [...root.querySelectorAll<HTMLButtonElement>(".kq-wb-answer .kq-chip")].map(
    (c) => c.textContent ?? "",
  );

describe("ordering view variants", () => {
  it("renders the word bank by default, with a switch toggle", () => {
    init(host, { quiz: orderingQuiz });
    expect(host.querySelector(".kq-wordbank")).not.toBeNull();
    expect(host.querySelector(".kq-ordering")).toBeNull();
    // all words start in the bank, the answer line is empty
    expect(host.querySelectorAll(".kq-wb-bank .kq-chip").length).toBe(4);
    expect(answerWords(host)).toEqual([]);
    // both variants exist and switching is on by default → a toggle appears
    expect(host.querySelector(".kq-view-toggle")).not.toBeNull();
  });

  it("renders the arrows variant when the developer default asks for it", () => {
    init(host, { quiz: orderingQuiz, views: { ordering: "arrows" } });
    expect(host.querySelector(".kq-ordering")).not.toBeNull();
    expect(host.querySelector(".kq-wordbank")).toBeNull();
    expect(host.querySelectorAll(".kq-move").length).toBeGreaterThan(0);
  });

  it("tapping bank words into the correct order scores 100%", () => {
    init(host, { quiz: orderingQuiz });
    for (const word of ["She", "always", "drinks", "coffee"]) chip(host, word).click();
    expect(answerWords(host)).toEqual(["She", "always", "drinks", "coffee"]);
    expect(host.querySelectorAll(".kq-wb-bank .kq-chip").length).toBe(0);

    clickText(host, "Finish");
    expect(host.querySelector(".kq-score")?.textContent).toBe("100%");
  });

  it("scores 0% for a wrong order (position-sensitive)", () => {
    init(host, { quiz: orderingQuiz });
    for (const word of ["always", "She", "coffee", "drinks"]) chip(host, word).click();
    clickText(host, "Finish");
    expect(host.querySelector(".kq-score")?.textContent).toBe("0%");
  });

  it("returns a placed word to the bank when tapped in the answer line", () => {
    init(host, { quiz: orderingQuiz });
    chip(host, "She").click();
    expect(answerWords(host)).toEqual(["She"]);

    chip(host, "She").click(); // now in the answer line → tap removes it
    expect(answerWords(host)).toEqual([]);
    expect(host.querySelectorAll(".kq-wb-bank .kq-chip").length).toBe(4);
  });

  it("preserves the in-progress order when switching to the arrows variant", () => {
    init(host, { quiz: orderingQuiz });
    for (const word of ["She", "always"]) chip(host, word).click();

    viewBtn(host, "Arrows").click();
    // arrows view completes the partial order by appending the not-yet-placed words
    expect(host.querySelector(".kq-ordering")).not.toBeNull();
    const rows = [...host.querySelectorAll(".kq-ordering-item .kq-row-label")].map(
      (r) => r.textContent,
    );
    expect(rows.slice(0, 2)).toEqual(["She", "always"]);
  });

  it("remembers the learner's choice per quiz in localStorage", () => {
    init(host, { quiz: orderingQuiz });
    expect(host.querySelector(".kq-wordbank")).not.toBeNull(); // default word bank

    viewBtn(host, "Arrows").click();
    expect(host.querySelector(".kq-ordering")).not.toBeNull();
    expect(localStorage.getItem("kensai-quiz-view-prefs")).toContain("arrows");

    // A fresh player over the same quiz honors the saved preference.
    const second = document.createElement("div");
    document.body.append(second);
    init(second, { quiz: orderingQuiz });
    expect(second.querySelector(".kq-ordering")).not.toBeNull();
  });

  it("hides the toggle (but still honors the default view) when locked", () => {
    init(host, { quiz: orderingQuiz, editableViews: false });
    expect(host.querySelector(".kq-view-toggle")).toBeNull();
    expect(host.querySelector(".kq-wordbank")).not.toBeNull();
  });

  it("disables and colors the words after checking in immediate-feedback mode", () => {
    init(host, {
      quiz: orderingQuiz,
      settings: { navigation: "sequential", feedback: "immediate" },
    });
    for (const word of ["She", "coffee", "drinks", "always"]) chip(host, word).click();
    clickText(host, "Check");

    expect(host.querySelector(".kq-feedback")).not.toBeNull();
    expect([...host.querySelectorAll<HTMLButtonElement>(".kq-chip")].every((c) => c.disabled)).toBe(true);
    // position 0 "She" is correct; position 1 "coffee" should have been "always"
    expect(chip(host, "She").classList.contains("kq-correct")).toBe(true);
    expect(chip(host, "coffee").classList.contains("kq-incorrect")).toBe(true);
  });
});
