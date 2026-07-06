# @kensai/quiz-core

Headless, UI-agnostic engine for the [Kensai Quiz format](../../spec). It loads and
validates a quiz file, evaluates answers, runs an **attempt** (a framework-agnostic
state machine), and computes **per-category statistics**. No DOM, no timers, no UI
dependency — any web project brings its own UI and consumes this package.

```text
quiz file (YAML/JSON)  ──loadQuiz──▶  Quiz  ──Attempt──▶  events + QuizResult + QuizStats
                          │
                          └─ validated against spec/quiz.schema.json (authoritative)
```

## Install

```bash
pnpm add @kensai/quiz-core
```

## Quick start

```ts
import { loadQuiz, Attempt } from "@kensai/quiz-core";

const quiz = loadQuiz(yamlString);                 // parse + validate (throws on error)

const attempt = new Attempt(quiz, {
  settings: { feedback: "immediate" },             // per-attempt overrides (optional)
});

attempt.on("answered", ({ result }) => {           // `result` only under immediate feedback
  if (result) console.log(result.correct ? "✓" : "✗");
});
attempt.on("finished", ({ result }) => {
  console.log(`${result.score}/${result.maxScore}`, result.passed);
  for (const c of result.stats.byCategory) {
    console.log(c.label ?? c.categoryId, `${c.correct}/${c.total}`);
  }
});

attempt.start();
attempt.answer(["verb"]);   // answer current question (shape depends on type — see below)
attempt.next();
// ...
attempt.finish();
```

Prefer stateless calls? Skip the attempt and evaluate directly:

```ts
import { evaluateQuiz } from "@kensai/quiz-core";
const result = evaluateQuiz(quiz, { q1: ["verb"], q7: "mice" }); // keyed by question id
```

## Answer shapes (per question type)

| Type | Answer value |
|------|--------------|
| `choice` | option id (`"a"`) or list of ids (`["a","b"]`) |
| `true_false` | `boolean` |
| `fill_blank` | `{ [blankId]: text-or-optionId }` |
| `classify` | `{ [itemId]: groupId }` |
| `matching` | `{ [leftId]: rightId }` |
| `ordering` | ordered id list (`["b","a","c"]`) |
| `short_answer` | `string` |

Answers are keyed by the question's `id`, falling back to its index (as a string)
when it has none.

## API surface

- **Load / validate** — `loadQuiz`, `parseQuizSource`, `validateQuiz`,
  `validateSchema`, `validateReferences`, `QuizValidationError`. Validation combines
  the JSON Schema (structure) with referential checks (answer ids exist, `*_from`
  names resolve, placeholders match blanks, ordering answers are permutations, …).
- **Evaluate** — `evaluateQuiz`, `evaluateQuestion`, `gradeQuestion`. Partial credit
  is awarded where meaningful (`fill_blank`, `classify`, `matching`, `ordering`);
  `choice` / `true_false` / `short_answer` are all-or-nothing.
- **Statistics** — `computeStats` → overall + per-category counts, scores, accuracy.
- **Runtime** — `Attempt` (navigation, answers, feedback timing, optional time limit,
  events `started` / `answered` / `navigated` / `time_up` / `finished`, plus
  `toJSON()` / `Attempt.resume()` for persistence). The clock and RNG are injectable
  (`now`, `rng`) for testing and SSR; the attempt never starts real timers.
- **Settings** — `resolveSettings`, `DEFAULT_SETTINGS`. Defaults: `navigation: all`,
  `order: fixed`, `feedback: on_finish`, unlimited time, `shuffle_options: false`.

## Development

```bash
pnpm sync:schema   # regenerate src/schema.generated.ts from spec/quiz.schema.json
pnpm build         # tsc → dist (ESM + .d.ts)
pnpm test          # vitest (unit + validates every spec/examples/*.yaml)
pnpm typecheck     # tsc --noEmit
```

The JSON Schema in `spec/` is the single source of truth for validation; it is inlined
into `src/schema.generated.ts` (a generated file) so the package needs no runtime file
read and bundles cleanly for the browser. Regenerate with `pnpm sync:schema` after any
schema change.
