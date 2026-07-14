# CLAUDE.md

Guidance for Claude Code (and contributors) working in this repository.

## What this project is

`kensai-quiz-core` is an **open-source, specification-first quiz ecosystem**. The
center of the project is a portable file format (YAML/JSON) that describes an
educational quiz — questions, answers, and behavior — independently of any UI. The
format is designed so that **humans and LLMs can author a complete quiz as a single
file**, which a "core" library can later validate, load, score, and turn into
statistics; renderers/players consume those results.

Primary use cases driving the design: English-learning drills (word classification,
fill-in-the-blank, multiple choice) and PersonVUE-style certification practice exams.

## Repository layout

| Path | Role | Status |
|------|------|--------|
| `spec/` | The specification and its docs — the current deliverable. | **Active** |
| `spec/quiz.schema.json` | JSON Schema (draft 2020-12); authoritative for validation. | Active |
| `spec/SPECIFICATION.md` | Canonical human-readable format definition. | Active |
| `spec/AI_AUTHORING_GUIDE.md` | Paste-into-a-chat prompt for LLM quiz generation. | Active |
| `spec/examples/` | One quiz per type + `mixed-demo.yaml` (all types). | Active |
| `packages/core/` | **`@kensai/quiz-core`** — headless engine: load / validate / evaluate / attempt runtime / statistics. No UI. | **Active** |
| `packages/player-web/` | **`@kensai/quiz-player`** — framework-free embeddable player; consumes `core`. Ships npm (ESM/CJS) + a self-contained CDN IIFE (`KensaiQuiz.init`). | **Active** |

The project is a **pnpm workspace (monorepo)**: `spec/` defines the format; `packages/`
holds code. `@kensai/quiz-core` is the headless engine and the product; `@kensai/quiz-player`
is one UI consumer (others may bring their own). The core stays strictly UI-agnostic.
Node ≥ 18, TypeScript, ESM.

Vision context lives in the two design notes the project started from (project
vision + quiz-spec responsibilities); the concrete decisions they imply are already
reflected in `spec/` and `packages/core`.

## Working in `packages/core`

- The JSON Schema (`spec/quiz.schema.json`) is authoritative for validation and is
  **inlined** into `packages/core/src/schema.generated.ts` (a generated, git-ignored
  file) via `pnpm sync:schema`. Never edit the generated file; edit the schema and
  regenerate. `sync:schema` runs automatically before build / test / typecheck.
- Hand-written TS types in `src/types.ts` mirror the schema — keep them in sync when
  the schema changes.
- Verify with `pnpm -C packages/core test` (unit tests + validates every
  `spec/examples/*.yaml`), `pnpm -C packages/core typecheck`, and `pnpm -C packages/core build`.

## Working in `packages/player-web`

- Framework-free (vanilla TS + DOM). Must stay UI-only: all quiz logic lives in
  `@kensai/quiz-core` — do not duplicate scoring/validation here.
- **Two entry points** (`src/index.ts`): `init` (controlled — developer owns the quiz;
  `QuizPlayer` supports deferred `setQuiz`/`setQuestions`/`setSettings`, and an opt-in
  ⚙️ gear via `editableSettings`) and `library` (playground — `QuizLibrary` lets the
  learner upload/paste YAML, or **✨ Create with AI** — generate a copy-paste LLM prompt
  that **embeds `spec/AI_AUTHORING_GUIDE.md` inline** so it works with non-browsing models;
  the guide is inlined into git-ignored `src/ai-guide.generated.ts` via `pnpm sync:guide`
  (auto-runs pre build/test/typecheck, mirroring core's `sync:schema`) — persisted to
  `localStorage` via `src/storage.ts`). The settings gear form is shared in
  `src/settings-ui.ts`; both get a
  ⛶ fullscreen toggle and a ☀/🌙 light-dark theme toggle (`src/theme.ts`, remembered in
  `localStorage`; applied as a `.kq-theme-{light,dark}` class that cascades into nested
  `.kq-root`). In the library these controls sit in the header from the start.
- Built with **tsup** into two shapes: npm (ESM/CJS + `.d.ts`, core kept external) and a
  self-contained CDN IIFE (`dist/kensai-quiz-player.global.js`, exposes `window.KensaiQuiz`,
  bundles everything). Build core first (`pnpm -r build` handles ordering).
- Verify with `pnpm -C packages/player-web test` (vitest + jsdom), `typecheck`, `build`.
  Manual/browser check: `examples/cdn.html` (controlled) and `examples/library.html`
  (playground) exercise the CDN global.
- Text is rendered via a **safe inline-Markdown** subset (`src/markdown.ts`) that escapes
  HTML first — keep that invariant when touching rendering.
- **View variants**: a question type may offer more than one presentation, declared in
  `VIEW_VARIANTS` (`src/views.ts`; e.g. `classify` = `dropdown` | `buckets`, the tap-to-place
  "word bank"). A variant is just another builder that keeps the same
  `getAnswer`/`setAnswer`/`setDisabled` contract, so core scoring is untouched. The player
  resolves the active variant as: learner's saved per-quiz choice → developer default
  (`PlayerOptions.views`) → first variant. Learner switching is on by default and can be
  locked via `editableViews`; the choice is a UI-only preference persisted **per quiz** in
  `localStorage` via `src/view-prefs.ts` (keyed `metadata.id ?? title`, mirroring `theme.ts`).
  This is a player concern only — the spec/schema/core stay UI-agnostic.

## Format conventions (must follow)

- **`snake_case`** for all field names.
- **All human text is Markdown** (`title`, `description`, `prompt`, `explanation`,
  option/item/group text and labels).
- **Answers reference ids, not repeated text** — this is the core token-saving rule.
  `choice.answer` is a list of option ids; `classify` items point at a group id;
  `matching.answer` maps ids to ids; `ordering.answer` is an ordered id list.
- **`settings` is entirely optional.** When present it holds author defaults that a
  player may override per attempt; when omitted, documented defaults apply
  (`navigation: all`, `order: fixed`, `feedback: on_finish`, unlimited time,
  `shuffle_options: false`). Omitting it is encouraged when generating with an LLM.
- **`schema_version` is required** (`"0.1"`) and versioned `MAJOR.MINOR`; minor bumps
  stay backward compatible.
- Each question may carry a `category` so results can be reported **per topic** at the
  end of an attempt (what the learner should focus on).

The seven question types are: `choice`, `true_false`, `fill_blank`, `classify`,
`matching`, `ordering`, `short_answer`.

## When changing the format

The JSON Schema and the docs must stay in sync — **`quiz.schema.json` is
authoritative**. After any change:

1. Update `quiz.schema.json` and `SPECIFICATION.md` together (field tables, enums,
   defaults, required fields must match).
2. Update `AI_AUTHORING_GUIDE.md` if the authoring surface changed.
3. Add/adjust an example under `spec/examples/` and keep `mixed-demo.yaml` covering
   every type.
4. Validate every `spec/examples/*.yaml` against the schema (see below). All must pass.
5. Bump `schema_version` if the change is not backward compatible, and note migration.

## Validating examples

There is no runtime code yet, so validation is manual. Convert YAML to JSON and run
any JSON Schema (draft 2020-12) validator against `spec/quiz.schema.json` — e.g. a
short Node script using `ajv` + `js-yaml`, or `ajv-cli`. Every file in
`spec/examples/` must validate. A reusable validator will eventually live in `src/`.

## Language & collaboration

All repository artifacts (docs, code, comments, identifiers) are written in
**English** to encourage open-source collaboration, even when issues or discussion
happen in another language.
