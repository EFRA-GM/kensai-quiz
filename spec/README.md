# Kensai Quiz — Specification

**Current version: `0.1`**

This folder is the center of the project: a specification-first, UI-agnostic format
for educational quizzes that humans and LLMs can author as a single portable YAML
(or JSON) file.

## What's here

| File | Purpose |
|------|---------|
| [`SPECIFICATION.md`](./SPECIFICATION.md) | Canonical, human-readable definition of the format. Start here. |
| [`quiz.schema.json`](./quiz.schema.json) | JSON Schema (draft 2020-12) for automated validation and editor autocomplete. **Authoritative** if it disagrees with the docs. |
| [`AI_AUTHORING_GUIDE.md`](./AI_AUTHORING_GUIDE.md) | Compact, paste-into-a-chat prompt so an LLM emits valid quizzes. |
| [`examples/`](./examples/) | One quiz per question type, plus [`mixed-demo.yaml`](./examples/mixed-demo.yaml) covering all seven. |

## How the pieces fit

```text
   SPECIFICATION.md  ──describes──▶  the format
   quiz.schema.json  ──validates──▶  quiz files
 AI_AUTHORING_GUIDE  ──teaches───▶  an LLM to generate quiz files
        examples/    ──demonstrate─▶  the format in practice
```

## Question types (v0.1)

`choice` · `true_false` · `fill_blank` · `classify` · `matching` · `ordering` ·
`short_answer` — see [`SPECIFICATION.md`](./SPECIFICATION.md#questions).

## Editor autocomplete

Example files begin with:

```yaml
# yaml-language-server: $schema=../quiz.schema.json
```

With the YAML extension (VS Code `redhat.vscode-yaml`, or any `yaml-language-server`
client), this gives live validation and completion. Point the path at
`quiz.schema.json` relative to your file.

## Validating a quiz

Any JSON Schema validator works (e.g. Node's `ajv-cli` with YAML converted to JSON).
A reusable validator now lives in [`@kensai/quiz-core`](../packages/core): use
`loadQuiz` / `validateQuiz`, which combine this schema with referential-integrity
checks. Its test suite validates every file in `examples/` against `quiz.schema.json`.

## Versioning

`schema_version` is `MAJOR.MINOR`. Minor bumps are backward-compatible additions;
major bumps may change or remove fields and will ship migration notes. Readers should
reject unsupported versions rather than guess. See
[`SPECIFICATION.md`](./SPECIFICATION.md#versioning).
