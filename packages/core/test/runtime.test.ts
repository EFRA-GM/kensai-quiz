import { describe, expect, it, vi } from "vitest";
import { Attempt } from "../src/index.js";
import type { Quiz } from "../src/index.js";

const quiz: Quiz = {
  schema_version: "0.1",
  metadata: { title: "Runtime" },
  questions: [
    { id: "a", type: "true_false", prompt: "1?", answer: true },
    { id: "b", type: "true_false", prompt: "2?", answer: false },
    { id: "c", type: "true_false", prompt: "3?", answer: true },
  ],
};

describe("Attempt lifecycle", () => {
  it("starts, records answers, and finishes with a result", () => {
    const attempt = new Attempt(quiz);
    const started = vi.fn();
    const finished = vi.fn();
    attempt.on("started", started);
    attempt.on("finished", finished);

    attempt.start();
    attempt.answer(true); // a correct
    attempt.next();
    attempt.answer(true); // b wrong
    const result = attempt.finish();

    expect(started).toHaveBeenCalledOnce();
    expect(finished).toHaveBeenCalledOnce();
    expect(result.score).toBe(1);
    expect(attempt.getStatus()).toBe("finished");
  });

  it("finish is idempotent", () => {
    const attempt = new Attempt(quiz);
    const first = attempt.finish();
    const second = attempt.finish();
    expect(second).toBe(first);
  });

  it("returns immediate feedback only when configured", () => {
    const onFinish = new Attempt(quiz);
    onFinish.start();
    expect(onFinish.answer(true)).toBeNull();

    const immediate = new Attempt(quiz, { settings: { feedback: "immediate" } });
    immediate.start();
    const result = immediate.answer(true);
    expect(result?.correct).toBe(true);
  });

  it("navigation honors bounds", () => {
    const attempt = new Attempt(quiz);
    attempt.start();
    expect(attempt.canGoPrev()).toBe(false);
    expect(attempt.prev()).toBeNull();
    attempt.next();
    attempt.next();
    expect(attempt.canGoNext()).toBe(false);
    expect(attempt.next()).toBeNull();
    expect(attempt.current().index).toBe(2);
  });
});

describe("Attempt options", () => {
  it("random order is deterministic under an injected rng", () => {
    const seq = [0.99, 0.01, 0.5, 0.5];
    let i = 0;
    const rng = () => seq[i++ % seq.length]!;
    const a1 = new Attempt(quiz, { settings: { order: "random" }, rng });
    i = 0;
    const a2 = new Attempt(quiz, { settings: { order: "random" }, rng });
    const order1 = a1.toJSON().order;
    const order2 = a2.toJSON().order;
    expect(order1).toEqual(order2);
    expect([...order1].sort()).toEqual([0, 1, 2]); // still a permutation
  });

  it("shuffles a choice question's options stably, honoring the per-question opt-out", () => {
    const optQuiz: Quiz = {
      schema_version: "0.1",
      metadata: { title: "Opts" },
      questions: [
        {
          id: "q",
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
    };
    const rng = () => 0; // deterministic Fisher–Yates (rotates the array)
    const attempt = new Attempt(optQuiz, { settings: { shuffle_options: true }, rng });

    const first = attempt.optionsFor(optQuiz.questions[0]!, 0).map((o) => o.id);
    const again = attempt.optionsFor(optQuiz.questions[0]!, 0).map((o) => o.id);
    expect(first).toEqual(again); // stable across calls
    expect(first).not.toEqual(["a", "b", "c", "d"]); // actually reordered
    expect([...first].sort()).toEqual(["a", "b", "c", "d"]); // still a permutation

    // The opt-out question keeps its authored order.
    expect(attempt.optionsFor(optQuiz.questions[1]!, 1).map((o) => o.id)).toEqual(["a", "b", "c"]);

    // And the order survives a resume round-trip.
    const resumed = Attempt.resume(optQuiz, attempt.toJSON(), { rng: () => 0 });
    expect(resumed.optionsFor(optQuiz.questions[0]!, 0).map((o) => o.id)).toEqual(first);
  });

  it("leaves options in authored order when shuffling is off", () => {
    const optQuiz: Quiz = {
      schema_version: "0.1",
      metadata: { title: "Opts" },
      questions: [
        {
          id: "q",
          type: "choice",
          prompt: "Pick",
          options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
          answer: ["a"],
        },
      ],
    };
    const attempt = new Attempt(optQuiz); // shuffle_options defaults to false
    expect(attempt.optionsFor(optQuiz.questions[0]!, 0).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("auto-finishes when the time limit elapses", () => {
    let clock = 1000;
    const now = () => clock;
    const attempt = new Attempt(quiz, { settings: { time_limit: 10 }, now });
    const timeUp = vi.fn();
    attempt.on("time_up", timeUp);

    attempt.start();
    expect(attempt.remainingTime()).toBe(10);
    clock += 11_000; // 11s later
    const result = attempt.answer(true);
    expect(result).toBeNull();
    expect(timeUp).toHaveBeenCalledOnce();
    expect(attempt.getStatus()).toBe("finished");
  });
});

describe("Attempt persistence", () => {
  it("resumes from a snapshot", () => {
    const attempt = new Attempt(quiz);
    attempt.start();
    attempt.answer(true);
    attempt.next();
    const snapshot = attempt.toJSON();

    const resumed = Attempt.resume(quiz, snapshot);
    expect(resumed.getStatus()).toBe("in_progress");
    expect(resumed.current().index).toBe(1);
    expect(resumed.getAnswers()).toEqual({ a: true });
    expect(resumed.finish().score).toBe(1);
  });
});
