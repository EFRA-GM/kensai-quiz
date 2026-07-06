import { describe, expect, it } from "vitest";
import { loadQuiz, QuizValidationError, validateQuiz } from "../src/index.js";
import type { Quiz } from "../src/index.js";

const minimal: Quiz = {
  schema_version: "0.1",
  metadata: { title: "Minimal" },
  questions: [{ type: "true_false", prompt: "Sky is blue.", answer: true }],
};

describe("schema validation", () => {
  it("accepts a minimal valid quiz", () => {
    expect(validateQuiz(minimal).valid).toBe(true);
  });

  it("rejects a missing schema_version", () => {
    const { schema_version, ...rest } = minimal;
    const result = validateQuiz(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "schema")).toBe(true);
  });

  it("rejects an unknown top-level field", () => {
    const result = validateQuiz({ ...minimal, surprise: 1 });
    expect(result.valid).toBe(false);
  });

  it("rejects a choice with both options and options_from", () => {
    const result = validateQuiz({
      schema_version: "0.1",
      metadata: { title: "x" },
      option_groups: { g: [{ id: "a", text: "A" }, { id: "b", text: "B" }] },
      questions: [
        {
          type: "choice",
          prompt: "?",
          options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
          options_from: "g",
          answer: ["a"],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});

describe("referential validation", () => {
  it("flags an answer id that is not among the options", () => {
    const result = validateQuiz({
      schema_version: "0.1",
      metadata: { title: "x" },
      questions: [
        {
          type: "choice",
          prompt: "?",
          options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
          answer: ["z"],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "reference")).toBe(true);
  });

  it("flags a classify item pointing at an undeclared group", () => {
    const result = validateQuiz({
      schema_version: "0.1",
      metadata: { title: "x" },
      questions: [
        {
          type: "classify",
          prompt: "?",
          groups: [{ id: "g1", label: "One" }, { id: "g2", label: "Two" }],
          items: [{ id: "i1", text: "x", answer: "nope" }],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("/answer"))).toBe(true);
  });

  it("flags an ordering answer that is not a permutation", () => {
    const result = validateQuiz({
      schema_version: "0.1",
      metadata: { title: "x" },
      questions: [
        {
          type: "ordering",
          prompt: "?",
          items: [{ id: "a", text: "1" }, { id: "b", text: "2" }],
          answer: ["a", "a"],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it("warns (not errors) on an undeclared question category", () => {
    const result = validateQuiz({
      schema_version: "0.1",
      metadata: { title: "x" },
      categories: [{ id: "known", label: "Known" }],
      questions: [
        { type: "true_false", prompt: "?", answer: true, category: "ghost" },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns when a blank has no matching placeholder", () => {
    const result = validateQuiz({
      schema_version: "0.1",
      metadata: { title: "x" },
      questions: [
        {
          type: "fill_blank",
          prompt: "No placeholders here.",
          blanks: { "1": { accept: ["a"] } },
        },
      ],
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("loadQuiz", () => {
  it("throws QuizValidationError with issues on invalid input", () => {
    try {
      loadQuiz({ schema_version: "0.1", metadata: {}, questions: [] });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(QuizValidationError);
      expect((err as QuizValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it("can skip validation when asked", () => {
    expect(() => loadQuiz({ anything: true } as object, { validate: false })).not.toThrow();
  });
});
