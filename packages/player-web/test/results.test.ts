import { beforeEach, describe, expect, it } from "vitest";
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
} from "../src/results";

const KEY = "test-lib";

const attempt = (ratio: number, byCategory: StoredAttempt["byCategory"] = [], at = 0): StoredAttempt => ({
  at,
  ratio,
  score: ratio * 10,
  maxScore: 10,
  passed: null,
  byCategory,
});

const cat = (categoryId: string | null, correct: number, total: number, label?: string) => ({
  categoryId,
  label,
  correct,
  total,
  accuracy: total > 0 ? correct / total : 0,
});

beforeEach(() => {
  localStorage.clear();
});

describe("toStoredAttempt", () => {
  it("maps a QuizResult down to the stored shape", () => {
    const result = {
      results: [],
      score: 7,
      maxScore: 10,
      ratio: 0.7,
      passed: true,
      stats: {
        overall: {} as never,
        byCategory: [
          { categoryId: "g", label: "Grammar", total: 4, answered: 4, correct: 3, incorrect: 1, score: 3, maxScore: 4, accuracy: 0.75 },
        ],
      },
    } as unknown as QuizResult;

    const stored = toStoredAttempt(result, 1234, 5000);
    expect(stored).toEqual({
      at: 1234,
      ratio: 0.7,
      score: 7,
      maxScore: 10,
      passed: true,
      durationMs: 5000,
      byCategory: [{ categoryId: "g", label: "Grammar", correct: 3, total: 4, accuracy: 0.75 }],
    });
  });

  it("omits durationMs when not provided", () => {
    const result = { score: 1, maxScore: 1, ratio: 1, passed: null, stats: { byCategory: [] } } as unknown as QuizResult;
    expect(toStoredAttempt(result, 1)).not.toHaveProperty("durationMs");
  });
});

describe("recordAttempt / attemptsFor / clearAttempts", () => {
  it("appends attempts oldest-first and reads them back", () => {
    recordAttempt(KEY, "q1", attempt(0.5, [], 1));
    recordAttempt(KEY, "q1", attempt(0.8, [], 2));
    const list = attemptsFor(KEY, "q1");
    expect(list.map((a) => a.at)).toEqual([1, 2]);
    // Independent per quiz id.
    expect(attemptsFor(KEY, "q2")).toEqual([]);
  });

  it("caps to the most recent `max`", () => {
    for (let i = 1; i <= 5; i++) recordAttempt(KEY, "q1", attempt(0.1 * i, [], i), 3);
    const list = attemptsFor(KEY, "q1");
    expect(list).toHaveLength(3);
    expect(list.map((a) => a.at)).toEqual([3, 4, 5]); // oldest two dropped
  });

  it("clears a quiz's history without touching others", () => {
    recordAttempt(KEY, "q1", attempt(0.5));
    recordAttempt(KEY, "q2", attempt(0.6));
    clearAttempts(KEY, "q1");
    expect(attemptsFor(KEY, "q1")).toEqual([]);
    expect(attemptsFor(KEY, "q2")).toHaveLength(1);
  });
});

describe("summarize", () => {
  it("returns zeros for no attempts", () => {
    expect(summarize([])).toEqual({ count: 0, averagePct: 0, bestPct: 0, lastPct: 0 });
  });

  it("computes count, average, best and last percentages", () => {
    const s = summarize([attempt(0.5), attempt(1.0), attempt(0.6)]);
    expect(s).toEqual({ count: 3, averagePct: 70, bestPct: 100, lastPct: 60 });
  });
});

describe("weakestCategory", () => {
  it("picks the lowest-accuracy bucket with questions", () => {
    const worst = weakestCategory([cat("a", 4, 5, "A"), cat("b", 1, 5, "B"), cat("c", 3, 5, "C")]);
    expect(worst?.categoryId).toBe("b");
  });

  it("ignores empty buckets and returns null when none have questions", () => {
    expect(weakestCategory([cat("a", 0, 0)])).toBeNull();
    const worst = weakestCategory([cat("a", 0, 0), cat("b", 2, 4)]);
    expect(worst?.categoryId).toBe("b");
  });

  it("keeps the first on a tie", () => {
    const worst = weakestCategory([cat("a", 1, 2), cat("b", 1, 2)]);
    expect(worst?.categoryId).toBe("a");
  });
});

describe("aggregateByCategory", () => {
  it("sums correct/total across attempts and recomputes accuracy, preserving order", () => {
    const agg = aggregateByCategory([
      attempt(0.5, [cat("g", 1, 2, "Grammar"), cat("v", 2, 2, "Vocab")]),
      attempt(0.5, [cat("g", 3, 4), cat("v", 0, 2)]),
    ]);
    expect(agg.map((c) => c.categoryId)).toEqual(["g", "v"]);
    const g = agg.find((c) => c.categoryId === "g")!;
    expect([g.correct, g.total, g.label]).toEqual([4, 6, "Grammar"]);
    expect(g.accuracy).toBeCloseTo(4 / 6);
    const v = agg.find((c) => c.categoryId === "v")!;
    expect([v.correct, v.total]).toEqual([2, 4]);
  });
});

describe("hasTopics", () => {
  it("is false for a single uncategorized bucket, true otherwise", () => {
    expect(hasTopics([cat(null, 2, 3)])).toBe(false);
    expect(hasTopics([cat("g", 2, 3)])).toBe(true);
    expect(hasTopics([cat(null, 1, 1), cat("g", 1, 1)])).toBe(true);
    expect(hasTopics([])).toBe(false);
  });
});
