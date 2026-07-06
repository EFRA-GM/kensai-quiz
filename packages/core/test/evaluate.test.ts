import { describe, expect, it } from "vitest";
import { evaluateQuiz, gradeQuestion } from "../src/index.js";
import type { AnswerInput, Question, Quiz } from "../src/index.js";

const quiz: Quiz = {
  schema_version: "0.1",
  metadata: { title: "Grading" },
  option_groups: {
    pos: [{ id: "verb", text: "Verb" }, { id: "noun", text: "Noun" }],
  },
  categories: [
    { id: "grammar", label: "Grammar" },
    { id: "vocab", label: "Vocabulary" },
  ],
  questions: [
    {
      id: "q_choice",
      type: "choice",
      category: "grammar",
      prompt: "run is a…",
      options_from: "pos",
      answer: ["verb"],
    },
    {
      id: "q_multi",
      type: "choice",
      select: "multiple",
      category: "grammar",
      prompt: "pick the vowels",
      options: [
        { id: "a", text: "a" },
        { id: "e", text: "e" },
        { id: "b", text: "b" },
      ],
      answer: ["a", "e"],
    },
    { id: "q_tf", type: "true_false", category: "grammar", prompt: "?", answer: false },
    {
      id: "q_fb",
      type: "fill_blank",
      category: "grammar",
      prompt: "She {{1}} and {{2}}.",
      blanks: {
        "1": { accept: ["runs"] },
        "2": { options: [{ id: "x", text: "is" }, { id: "y", text: "are" }], answer: "x" },
      },
    },
    {
      id: "q_cls",
      type: "classify",
      category: "vocab",
      prompt: "sort",
      groups: [{ id: "hot", label: "Hot" }, { id: "cold", label: "Cold" }],
      items: [
        { id: "i1", text: "boiling", answer: "hot" },
        { id: "i2", text: "freezing", answer: "cold" },
      ],
    },
    {
      id: "q_match",
      type: "matching",
      category: "vocab",
      prompt: "match",
      left: [{ id: "l1", text: "FR" }, { id: "l2", text: "JP" }],
      right: [{ id: "r1", text: "Paris" }, { id: "r2", text: "Tokyo" }],
      answer: { l1: "r1", l2: "r2" },
    },
    {
      id: "q_ord",
      type: "ordering",
      category: "vocab",
      prompt: "order",
      items: [{ id: "a", text: "1" }, { id: "b", text: "2" }, { id: "c", text: "3" }],
      answer: ["a", "b", "c"],
    },
    {
      id: "q_sa",
      type: "short_answer",
      category: "vocab",
      prompt: "plural of mouse",
      accept: ["mice"],
    },
  ],
};

const byId = (id: string): Question => quiz.questions.find((q) => q.id === id)!;

describe("gradeQuestion", () => {
  it("choice single: exact match", () => {
    expect(gradeQuestion(quiz, byId("q_choice"), "verb")).toBe(1);
    expect(gradeQuestion(quiz, byId("q_choice"), "noun")).toBe(0);
  });

  it("choice multiple: all-or-nothing set match", () => {
    expect(gradeQuestion(quiz, byId("q_multi"), ["a", "e"])).toBe(1);
    expect(gradeQuestion(quiz, byId("q_multi"), ["e", "a"])).toBe(1);
    expect(gradeQuestion(quiz, byId("q_multi"), ["a"])).toBe(0);
    expect(gradeQuestion(quiz, byId("q_multi"), ["a", "e", "b"])).toBe(0);
  });

  it("true_false: matches boolean, including false", () => {
    expect(gradeQuestion(quiz, byId("q_tf"), false)).toBe(1);
    expect(gradeQuestion(quiz, byId("q_tf"), true)).toBe(0);
  });

  it("fill_blank: partial credit across blanks", () => {
    expect(gradeQuestion(quiz, byId("q_fb"), { "1": "runs", "2": "x" })).toBe(1);
    expect(gradeQuestion(quiz, byId("q_fb"), { "1": "runs", "2": "y" })).toBe(0.5);
    expect(gradeQuestion(quiz, byId("q_fb"), { "1": "RUNS", "2": "x" })).toBe(1); // case-insensitive default
  });

  it("classify / matching: partial credit", () => {
    expect(gradeQuestion(quiz, byId("q_cls"), { i1: "hot", i2: "cold" })).toBe(1);
    expect(gradeQuestion(quiz, byId("q_cls"), { i1: "hot", i2: "hot" })).toBe(0.5);
    expect(gradeQuestion(quiz, byId("q_match"), { l1: "r1", l2: "r1" })).toBe(0.5);
  });

  it("ordering: partial by position", () => {
    expect(gradeQuestion(quiz, byId("q_ord"), ["a", "b", "c"])).toBe(1);
    expect(gradeQuestion(quiz, byId("q_ord"), ["a", "c", "b"])).toBeCloseTo(1 / 3);
  });

  it("short_answer: normalized synonyms", () => {
    expect(gradeQuestion(quiz, byId("q_sa"), "mice")).toBe(1);
    expect(gradeQuestion(quiz, byId("q_sa"), "  MICE ")).toBe(1);
    expect(gradeQuestion(quiz, byId("q_sa"), "rats")).toBe(0);
  });

  it("unanswered scores zero", () => {
    expect(gradeQuestion(quiz, byId("q_choice"), undefined)).toBe(0);
  });
});

describe("evaluateQuiz", () => {
  const allCorrect: Record<string, AnswerInput> = {
    q_choice: "verb",
    q_multi: ["a", "e"],
    q_tf: false,
    q_fb: { "1": "runs", "2": "x" },
    q_cls: { i1: "hot", i2: "cold" },
    q_match: { l1: "r1", l2: "r2" },
    q_ord: ["a", "b", "c"],
    q_sa: "mice",
  };

  it("scores a perfect attempt", () => {
    const result = evaluateQuiz(quiz, allCorrect);
    expect(result.score).toBe(8);
    expect(result.maxScore).toBe(8);
    expect(result.ratio).toBe(1);
    expect(result.results.every((r) => r.correct)).toBe(true);
  });

  it("aggregates per-category stats", () => {
    const result = evaluateQuiz(quiz, { q_choice: "verb" });
    const grammar = result.stats.byCategory.find((c) => c.categoryId === "grammar")!;
    expect(grammar.total).toBe(4);
    expect(grammar.correct).toBe(1);
    expect(grammar.label).toBe("Grammar");
    expect(result.stats.overall.total).toBe(8);
    expect(result.stats.overall.answered).toBe(1);
  });

  it("reports pass/fail against passing_score override", () => {
    const half: Record<string, AnswerInput> = { q_choice: "verb", q_tf: false };
    const pass = evaluateQuiz(quiz, half, { settingsOverride: { passing_score: 0.2 } });
    const fail = evaluateQuiz(quiz, half, { settingsOverride: { passing_score: 0.9 } });
    expect(pass.passed).toBe(true);
    expect(fail.passed).toBe(false);
    expect(evaluateQuiz(quiz, half).passed).toBeNull();
  });
});
