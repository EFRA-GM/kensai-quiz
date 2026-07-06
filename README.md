# Kensai Quiz

**A specification-first, open-source quiz ecosystem.** At its center is a portable
YAML/JSON format that describes an educational quiz — questions, answers, and behavior —
independently of any UI, so that **humans and LLMs can author a complete quiz as a single
file**. A headless engine loads, validates, scores, and produces statistics from that
file; players render it.

Built for English-learning drills (word classification, fill-in-the-blank, multiple
choice) and PearsonVUE-style certification practice exams.

```text
   quiz.yaml ──▶ @kensai/quiz-core ──▶ score + per-category stats
   (one file)      (headless engine)          │
                                               ▼
                                     @kensai/quiz-player  ──▶ rendered in the browser
                                     (or your own UI)
```

## Try it in 30 seconds

Requires [Node](https://nodejs.org) ≥ 18 and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm demo
```

Then open **http://localhost:4321/examples/cdn.html** — a full quiz, embedded with a
single `<script>` tag. Edit the YAML inside
[`packages/player-web/examples/cdn.html`](packages/player-web/examples/cdn.html) and
refresh to see your own questions.

## What's in here

This is a **pnpm workspace (monorepo)**.

| Path | What it is |
|------|------------|
| [`spec/`](spec) | **The format.** Human-readable spec, the authoritative JSON Schema, an LLM authoring guide, and examples. Start here. |
| [`packages/core/`](packages/core) | **`@kensai/quiz-core`** — headless engine: load, validate, evaluate answers, run an attempt, compute statistics. No UI. |
| [`packages/player-web/`](packages/player-web) | **`@kensai/quiz-player`** — framework-free embeddable player. Ships as npm (ESM/CJS) and a single self-contained CDN script. |

## Authoring a quiz

All text is Markdown; answers reference option **ids**, never repeated text (the core
token-saving rule). A tiny example:

```yaml
schema_version: "0.1"
metadata:
  title: "Present Simple — Quick Check"
questions:
  - type: choice
    prompt: "She ___ to work every day."
    options:
      - { id: a, text: "go" }
      - { id: b, text: "goes" }
    answer: [b]
    explanation: "Third person singular adds **-es**."
```

Seven question types are supported: `choice`, `true_false`, `fill_blank`, `classify`,
`matching`, `ordering`, `short_answer`. See [`spec/SPECIFICATION.md`](spec/SPECIFICATION.md)
for the full reference, and [`spec/AI_AUTHORING_GUIDE.md`](spec/AI_AUTHORING_GUIDE.md) for
a prompt you can paste into an LLM chat to generate valid quizzes.

## Using the engine (`@kensai/quiz-core`)

```ts
import { loadQuiz, evaluateQuiz } from "@kensai/quiz-core";

const quiz = loadQuiz(yamlString);                     // parse + validate (throws on error)
const result = evaluateQuiz(quiz, { q1: ["b"] });      // answers keyed by question id
console.log(result.score, result.ratio, result.stats.byCategory);
```

For an interactive session (navigation, feedback timing, timer, events) use the `Attempt`
state machine — see the [core README](packages/core/README.md).

## Embedding the player (`@kensai/quiz-player`)

**CDN — a single `<script>` (once published to npm):**

```html
<div id="quiz"></div>
<script src="https://cdn.jsdelivr.net/npm/@kensai/quiz-player/dist/kensai-quiz-player.global.js"></script>
<script>
  KensaiQuiz.init("#quiz", { quiz: yamlString });
</script>
```

**npm — for bundled apps:**

```ts
import { init } from "@kensai/quiz-player";
init("#quiz", { quiz: yamlString, settings: { feedback: "immediate" } });
```

The player works in **two modes**:

- **`init` — controlled.** The developer passes the quiz and settings; the learner just
  answers. Feed it later with `setQuiz` / `setQuestions` / `setSettings`, and optionally
  expose a ⚙️ gear (`editableSettings`) to let the learner tweak a whitelisted subset.
- **`library` — playground.** Starts empty; the learner uploads or pastes their own
  quizzes, saved in **their** browser and replayed from a list (each with play, settings,
  delete). A ⛶ fullscreen toggle is available in both. See
  [`examples/library.html`](packages/player-web/examples/library.html).

```ts
import { library } from "@kensai/quiz-player";
library("#app");   // or KensaiQuiz.library("#app") via the CDN script
```

See the [player README](packages/player-web/README.md) for options, theming, and behavior.

## Local development

Run everything from the repo root.

| Task | Command |
|------|---------|
| Install dependencies (first time) | `pnpm install` |
| Build everything (core → player) | `pnpm build` |
| **Build + open the demo** | `pnpm demo` → http://localhost:4321/examples/cdn.html |
| Run all tests | `pnpm test` |
| Type-check everything | `pnpm typecheck` |

**Iterating on the player UI** — two terminals:

```bash
pnpm -C packages/player-web dev     # terminal 1: rebuild on save
pnpm -C packages/player-web serve   # terminal 2: static server, then refresh the browser
```

> The player bundles the core, so after editing `packages/core/src/` rebuild it with
> `pnpm -C packages/core build` before refreshing.

Opening the demo HTML directly via `file://` will **not** work — it loads the built
script over HTTP, so a local server (any of the commands above) is required.

## How the pieces stay in sync

`spec/quiz.schema.json` is the **single source of truth** for validation. It is inlined
into the core (`pnpm sync:schema`, run automatically before build/test) so the engine
needs no runtime file read and bundles cleanly for the browser. When changing the format,
update the schema and `SPECIFICATION.md` together — see
[`CLAUDE.md`](CLAUDE.md) for contributor guidance.

## Status & conventions

- **Schema version `0.1`** — versioned `MAJOR.MINOR`; minor bumps stay backward compatible.
- Field names are `snake_case`; all human-facing text is Markdown.
- All repository artifacts are written in **English** to encourage open-source collaboration.

## License

MIT.
