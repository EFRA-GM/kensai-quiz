import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/index";
import type { Quiz } from "@kensai/quiz-core";

const classifyQuiz: Quiz = {
  schema_version: "0.1",
  metadata: { id: "cls", title: "Classify Test" },
  questions: [
    {
      id: "c1",
      type: "classify",
      prompt: "Sort the words.",
      groups: [
        { id: "g1", label: "Group One" },
        { id: "g2", label: "Group Two" },
      ],
      items: [
        { id: "i1", text: "alpha", answer: "g1" },
        { id: "i2", text: "beta", answer: "g2" },
      ],
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

const dropZone = (root: HTMLElement, label: string): HTMLElement => {
  const group = [...root.querySelectorAll<HTMLElement>(".kq-group")].find(
    (g) => g.querySelector(".kq-group-label")?.textContent === label,
  );
  const zone = group?.querySelector<HTMLElement>(".kq-group-drop");
  if (!zone) throw new Error(`drop zone "${label}" not found`);
  return zone;
};

const viewBtn = (root: HTMLElement, label: string): HTMLButtonElement => {
  const btn = [...root.querySelectorAll<HTMLButtonElement>(".kq-view-btn")].find(
    (b) => b.textContent === label,
  );
  if (!btn) throw new Error(`view button "${label}" not found`);
  return btn;
};

/** Place an item into a group via tap-to-place (select chip → tap group). */
const place = (root: HTMLElement, itemText: string, groupLabel: string): void => {
  chip(root, itemText).click();
  dropZone(root, groupLabel).click();
};

describe("classify view variants", () => {
  it("renders the dropdown variant by default, with a switch toggle", () => {
    init(host, { quiz: classifyQuiz });
    expect(host.querySelectorAll("select.kq-select").length).toBe(2);
    expect(host.querySelector(".kq-buckets")).toBeNull();
    // both variants exist and switching is on by default → a toggle appears
    expect(host.querySelector(".kq-view-toggle")).not.toBeNull();
  });

  it("renders the buckets variant when the developer default asks for it", () => {
    init(host, { quiz: classifyQuiz, views: { classify: "buckets" } });
    expect(host.querySelector(".kq-buckets")).not.toBeNull();
    expect(host.querySelector("select.kq-select")).toBeNull();
    // both items start in the pool
    expect(host.querySelectorAll(".kq-pool .kq-chip").length).toBe(2);
  });

  it("tap-to-place assigns items and scores identically to the dropdown", () => {
    init(host, { quiz: classifyQuiz, views: { classify: "buckets" } });
    place(host, "alpha", "Group One");
    place(host, "beta", "Group Two");
    // chips moved out of the pool into their groups
    expect(dropZone(host, "Group One").textContent).toContain("alpha");
    expect(host.querySelectorAll(".kq-pool .kq-chip").length).toBe(0);

    clickText(host, "Finish");
    expect(host.querySelector(".kq-score")?.textContent).toBe("100%");
  });

  it("gives partial credit when only some items are placed correctly", () => {
    init(host, { quiz: classifyQuiz, views: { classify: "buckets" } });
    place(host, "alpha", "Group One"); // correct
    place(host, "beta", "Group One"); // wrong (should be Group Two)
    clickText(host, "Finish");
    expect(host.querySelector(".kq-score")?.textContent).toBe("50%");
  });

  it("lets a placed item be selected again and returned to the pool", () => {
    init(host, { quiz: classifyQuiz, views: { classify: "buckets" } });
    place(host, "alpha", "Group One");
    expect(dropZone(host, "Group One").textContent).toContain("alpha");

    chip(host, "alpha").click(); // re-select the assigned chip
    host.querySelector<HTMLElement>(".kq-pool")!.click(); // tap the pool to return it
    expect(host.querySelector<HTMLElement>(".kq-pool")!.textContent).toContain("alpha");
  });

  it("preserves in-progress answers when switching variants", () => {
    init(host, { quiz: classifyQuiz, views: { classify: "buckets" } });
    place(host, "alpha", "Group One");

    viewBtn(host, "Dropdown").click();
    // the dropdown for item i1 now reflects the assignment made in the buckets view
    const selects = host.querySelectorAll<HTMLSelectElement>("select.kq-select");
    expect(selects[0]!.value).toBe("g1");
  });

  it("remembers the learner's choice per quiz in localStorage", () => {
    init(host, { quiz: classifyQuiz });
    expect(host.querySelector("select.kq-select")).not.toBeNull(); // default dropdown

    viewBtn(host, "Word bank").click();
    expect(host.querySelector(".kq-buckets")).not.toBeNull();
    expect(localStorage.getItem("kensai-quiz-view-prefs")).toContain("buckets");

    // A fresh player over the same quiz honors the saved preference.
    const second = document.createElement("div");
    document.body.append(second);
    init(second, { quiz: classifyQuiz });
    expect(second.querySelector(".kq-buckets")).not.toBeNull();
  });

  it("hides the toggle (but still honors the default view) when locked", () => {
    init(host, { quiz: classifyQuiz, views: { classify: "buckets" }, editableViews: false });
    expect(host.querySelector(".kq-view-toggle")).toBeNull();
    expect(host.querySelector(".kq-buckets")).not.toBeNull();
  });

  it("ignores a stored preference when switching is locked", () => {
    localStorage.setItem("kensai-quiz-view-prefs", JSON.stringify({ cls: { classify: "buckets" } }));
    init(host, { quiz: classifyQuiz, editableViews: false });
    // locked → falls back to the built-in default (dropdown), not the stored pref
    expect(host.querySelector("select.kq-select")).not.toBeNull();
    expect(host.querySelector(".kq-buckets")).toBeNull();
  });

  it("disables placement after checking in immediate-feedback mode", () => {
    init(host, {
      quiz: classifyQuiz,
      views: { classify: "buckets" },
      settings: { navigation: "sequential", feedback: "immediate" },
    });
    place(host, "alpha", "Group One");
    place(host, "beta", "Group Two");
    clickText(host, "Check");

    expect(host.querySelector(".kq-feedback")).not.toBeNull();
    expect([...host.querySelectorAll<HTMLButtonElement>(".kq-chip")].every((c) => c.disabled)).toBe(true);
  });
});

describe("correctness coloring on check", () => {
  const choiceQuiz: Quiz = {
    schema_version: "0.1",
    metadata: { title: "Choice" },
    questions: [
      { id: "c", type: "choice", prompt: "Pick B.", options: [{ id: "x", text: "A" }, { id: "y", text: "B" }], answer: ["y"] },
    ],
  } as unknown as Quiz;

  it("colors classify chips green/red in the buckets view", () => {
    init(host, {
      quiz: classifyQuiz,
      views: { classify: "buckets" },
      settings: { navigation: "sequential", feedback: "immediate" },
    });
    place(host, "alpha", "Group One"); // correct (i1 → g1)
    place(host, "beta", "Group One"); // wrong (should be g2)
    clickText(host, "Check");

    expect(chip(host, "alpha").classList.contains("kq-correct")).toBe(true);
    expect(chip(host, "beta").classList.contains("kq-incorrect")).toBe(true);
  });

  it("colors classify rows green/red in the dropdown view", () => {
    init(host, { quiz: classifyQuiz, settings: { navigation: "sequential", feedback: "immediate" } });
    const selects = host.querySelectorAll<HTMLSelectElement>("select.kq-select");
    selects[0]!.value = "g1"; // i1 correct
    selects[1]!.value = "g1"; // i2 wrong (should be g2)
    clickText(host, "Check");

    const rows = host.querySelectorAll(".kq-row");
    expect(rows[0]!.classList.contains("kq-correct")).toBe(true);
    expect(rows[1]!.classList.contains("kq-incorrect")).toBe(true);
  });

  it("marks the correct option green and a wrong pick red (choice)", () => {
    init(host, { quiz: choiceQuiz, settings: { navigation: "sequential", feedback: "immediate" } });
    host.querySelector<HTMLInputElement>('input[value="x"]')!.checked = true; // wrong pick
    clickText(host, "Check");

    const optX = host.querySelector('input[value="x"]')!.closest(".kq-option")!;
    const optY = host.querySelector('input[value="y"]')!.closest(".kq-option")!;
    expect(optY.classList.contains("kq-correct")).toBe(true); // correct answer revealed green
    expect(optX.classList.contains("kq-incorrect")).toBe(true); // wrong pick red
  });
});
