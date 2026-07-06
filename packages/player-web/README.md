# @kensai/quiz-player

An **embeddable, framework-free** web player for the [Kensai Quiz format](../../spec).
Drop a `<div>`, call `init`, and it renders a full quiz — questions, navigation,
feedback, timer, results, and per-category review. It has no framework dependency and
consumes [`@kensai/quiz-core`](../core) for all logic (loading, validation, scoring).

**▶️ Try the playground live (no install): [efra-gm.github.io/kensai-quiz](https://efra-gm.github.io/kensai-quiz/)**

Two ways to use it, for the two ways people run quizzes:

- **`init` — controlled.** The developer owns the quiz and its behavior; the learner
  just answers. Optionally opt them into a ⚙️ gear to tweak a whitelisted subset.
- **`library` — playground.** Start empty; the learner uploads or pastes their own
  quizzes, which are saved in **their** browser and replayed from a list.

Both are distributed **two ways**:

## 1. CDN — a single `<script>` tag (jQuery-style)

```html
<div id="quiz"></div>

<script src="https://cdn.jsdelivr.net/npm/@kensai/quiz-player/dist/kensai-quiz-player.global.js"></script>
<script>
  KensaiQuiz.init("#quiz", {
    quiz: `
schema_version: "0.1"
metadata: { title: "Quick Check" }
questions:
  - type: choice
    prompt: "She ___ to work."
    options: [ { id: a, text: "go" }, { id: b, text: "goes" } ]
    answer: [b]
`,
  });
</script>
```

The global build is fully self-contained (core + YAML parser + validator are bundled,
and styles inject themselves) — no other files to include. See
[`examples/cdn.html`](./examples/cdn.html).

## 2. npm — for bundled apps

```bash
pnpm add @kensai/quiz-player
```

```ts
import { init } from "@kensai/quiz-player";

const player = init("#quiz", {
  quiz: yamlOrJsonStringOrObject,
  settings: { feedback: "immediate" },   // per-attempt overrides (optional)
  onFinish: (result) => console.log(result.score, "/", result.maxScore),
});
```

## `init(target, options)` — controlled mode

`target` is an element, a CSS selector, or a bare element id. Returns a `QuizPlayer`.
Options:

| Option | Default | Notes |
|--------|---------|-------|
| `quiz` | — | YAML/JSON string or a parsed object. **Optional** — omit it and call `setQuiz`/`setQuestions` later. |
| `format` | `"yaml"` | Parser to use when `quiz` is a string. |
| `validate` | `true` | Validate before rendering (throws on invalid). |
| `settings` | — | Per-attempt overrides: `navigation`, `order`, `feedback`, `time_limit`, `shuffle_options`, `passing_score`. |
| `editableSettings` | — | Keys the learner may change via the ⚙️ gear: `navigation`, `order`, `feedback`, `shuffle_options`, `time_limit`, or `shuffle` (one toggle for **both** question order and answer options). **Omitted = locked** (no gear). |
| `fullscreen` | `true` | Show a ⛶ fullscreen toggle when the browser supports it. |
| `theme` | `true` | Show a ☀/🌙 light-dark theme toggle. |
| `autoStart` | `true` | Start the attempt immediately once a quiz is present. |
| `allowRestart` | `true` | Show a "Try again" button on the results screen. |
| `onFinish` | — | `(result) => void` when the attempt ends. |
| `onAnswer` | — | `(result \| null) => void` on each answer. |
| `now` / `rng` | — | Injectable clock / RNG (testing, deterministic order). |

### Imperative API (set data after `init`)

The developer stays in control: `init` can be called with **no quiz**, then fed later.

```ts
const player = init("#quiz");                 // renders an empty placeholder
player.setQuiz(yamlString);                    // load / replace the quiz
player.setQuestions([{ type: "true_false", prompt: "…", answer: true }]);  // bare list
player.setSettings({ navigation: "sequential", time_limit: 300 });         // restart w/ new settings
```

`QuizPlayer` also exposes `.getSettings()`, `.restart()`, `.destroy()`, and `.quiz`.

### Locked vs. editable behavior

By default the learner **cannot** change anything — `settings` is fixed by the
developer. Opt them into a ⚙️ gear by whitelisting keys:

```ts
init("#quiz", { quiz, editableSettings: ["feedback", "shuffle_options"] });
```

## `library(target, options)` — playground mode

Starts empty and lets the learner **upload a `.yaml`**, **paste YAML**, or **generate an
AI prompt** (see below). Saved quizzes live in `localStorage` (their browser only) and
appear in a list, each with ▶️ play, ⚙️ settings, and 🗑️ delete. Play mounts the same
`QuizPlayer`. A ☀/🌙 theme toggle and a ⛶ fullscreen toggle sit in the header **from the
start** (not only while playing). See [`examples/library.html`](./examples/library.html).

**✨ Create with AI** builds a ready-to-paste prompt for any LLM chat. It embeds the full
[AI authoring guide](../../spec/AI_AUTHORING_GUIDE.md) **inline** — so it works even with
models that can't open a URL — then takes what the learner wants to study and the language
the questions should be written in, and asks for a single valid quiz YAML to paste back and
save. The guide is inlined at build time from `spec/AI_AUTHORING_GUIDE.md` via
`pnpm sync:guide` (auto-runs before build/test/typecheck; the generated
`src/ai-guide.generated.ts` is git-ignored, like core's `schema.generated.ts`).

```ts
import { library } from "@kensai/quiz-player";

library("#app", {
  title: "My quizzes",
  storageKey: "my-app:quizzes",              // default: "kensai-quiz-library"
  editableSettings: ["navigation", "feedback", "time_limit"],
});
```

| Option | Default | Notes |
|--------|---------|-------|
| `storageKey` | `"kensai-quiz-library"` | localStorage key for the saved list. |
| `title` | `"My quizzes"` | Heading above the list. |
| `editableSettings` | all keys | Settings the learner may tweak per quiz / while playing. |
| `defaultSettings` | `{ navigation: "sequential", feedback: "immediate" }` | Per-attempt settings applied to **newly added** quizzes (a study-friendly default). Editable per quiz via ⚙️. |
| `fullscreen` | `true` | Passed through to the player. |
| `validate` | `true` | Validate quizzes on save/play (bad YAML shows an inline error). |

> Newly added quizzes default to **one question at a time** with **immediate feedback** —
> override with `defaultSettings`. In the ⚙️ panel the **time limit is entered in minutes**
> (stored internally as seconds).

## Behavior

- **Navigation** — `all` renders every question on one page with a single **Finish**;
  `sequential` shows one at a time with Previous / Next.
- **Feedback** — `immediate` adds a **Check** button that reveals correctness + the
  correct answer + explanation before advancing; `on_finish` defers everything to the
  results screen.
- **Results** — overall score and pass/fail, a per-category table (your "what to focus
  on"), and a full per-question review with your answer vs. the correct one.
- **Shuffling** — `order: random` shuffles the **question** order; `shuffle_options: true`
  shuffles a `choice` question's **answer options**, except questions that set
  `shuffle_options: false` (e.g. an "All of the above" option). Both orders are stable
  for the life of an attempt. In the gear, the `shuffle` control combines both into one
  learner-facing toggle (the library uses it by default).
- **Timer** — shown when `time_limit` is set; the attempt auto-finishes at zero.
- **Controls** — a ⚙️ gear (when `editableSettings` is set) opens an inline settings
  panel; applying restarts the attempt. A ⛶ fullscreen toggle appears when supported, and
  a ☀/🌙 toggle switches the light/dark theme.
- **Keyboard** — the first field/option of each question is focused automatically.
  **Enter** moves to the next field within a question, and on the last field (or a
  radio/checkbox) fires the **Check** / **Next** / **Finish** button. Composition input
  (IME) and multi-line textareas are left alone.
- All seven question types are supported, including a reorderable list for `ordering`
  and dropdowns for `classify` / `matching`.

## Theming

The player scopes everything under `.kq-root` and is driven by CSS variables, so a host
can restyle it without touching the markup:

```css
#quiz { --kq-accent: #0ea5e9; --kq-radius: 8px; }
```

The theme follows `prefers-color-scheme` by default; the ☀/🌙 toggle lets the learner
override it, and the choice is remembered in their browser. Override the toggle's effect
by scoping variables under `.kq-root.kq-theme-dark` / `.kq-root.kq-theme-light`.

## Development

```bash
pnpm build       # tsup → dist: ESM + CJS + .d.ts (npm) and *.global.js (CDN/IIFE)
pnpm test        # vitest + jsdom
pnpm typecheck   # tsc --noEmit
```

Text fields render a **safe subset of inline Markdown** (`**bold**`, `*italic*`,
`` `code` ``, links) with HTML escaped first.
