# Kensai Quiz Format — Specification v0.1

The canonical, human-readable definition of the quiz file format. The machine-
readable counterpart is [`quiz.schema.json`](./quiz.schema.json); if the two ever
disagree, **the JSON Schema is authoritative** and this document is a bug.

A quiz is a single YAML (or JSON) document. It is designed to be:

- **Self-contained** — one file is a complete quiz.
- **AI-friendly** — an LLM can generate it from a short prompt (see
  [`AI_AUTHORING_GUIDE.md`](./AI_AUTHORING_GUIDE.md)).
- **Token-efficient** — reusable option groups, optional `settings`, and answers
  that reference ids instead of repeating text.
- **UI-agnostic** — the format describes content and correctness, not presentation.

---

## Global rules

1. **Field names use `snake_case`.**
2. **All human text supports Markdown** — `title`, `description`, `prompt`,
   `explanation`, every option/item/group `text` and `label`.
3. **Answers reference ids, never repeated text.** A `choice` answer is a list of
   option ids; a `classify` item points at a group id; a `matching` answer maps ids
   to ids. This keeps files small and unambiguous.
4. **`schema_version` is required** and drives backward compatibility.
5. **Ids are unique within their local list** (options within a question, groups
   within a `classify`, etc.). A quiz-wide `metadata.id` is a separate, optional slug.

---

## Top-level document

| Field            | Required | Type   | Notes |
|------------------|----------|--------|-------|
| `schema_version` | yes      | string | Must be `"0.1"`. |
| `metadata`       | yes      | object | See [Metadata](#metadata). |
| `settings`       | no       | object | See [Settings](#settings). Omit entirely to save tokens. |
| `categories`     | no       | array  | Category registry for statistics. See [Categories & statistics](#categories--statistics). |
| `option_groups`  | no       | object | Reusable named option sets. See [Option groups](#option-groups). |
| `questions`      | yes      | array  | One or more questions. See [Questions](#questions). |

```yaml
schema_version: "0.1"
metadata:
  title: "Present Simple"
  path: "English / Verb system / Present tenses"
questions:
  - type: true_false
    prompt: "'Run' is a verb."
    answer: true
```

---

## Metadata

| Field         | Required | Type            | Notes |
|---------------|----------|-----------------|-------|
| `title`       | yes      | string          | Human title. |
| `id`          | no       | string          | Stable slug for the quiz. |
| `path`        | no       | string          | Study-path breadcrumb, e.g. `"English / Verb system / Present tenses"`. Free-form; ` / ` is the conventional separator. |
| `description` | no       | string          | Overview (Markdown). |
| `language`    | no       | string          | BCP-47 tag (`en`, `es`, `en-US`). Default `und`. |
| `author`      | no       | string          | |
| `tags`        | no       | string[]        | Free-form labels. |

---

## Settings

The **entire `settings` block is optional**. Omit it and the defaults below apply.
When present, these are the author's defaults; a player is free to override any of
them per attempt (e.g. let the learner turn on shuffle or pick a time limit).

| Field             | Type          | Default     | Meaning |
|-------------------|---------------|-------------|---------|
| `navigation`      | `all` \| `sequential` | `all` | Show every question at once, or advance one by one. |
| `order`           | `fixed` \| `random`   | `fixed` | Order in which **questions** are presented (`random` shuffles them). |
| `feedback`        | `immediate` \| `on_finish` | `on_finish` | Reveal correctness/explanation after each question, or only at the end. |
| `time_limit`      | number \| null | `null` (unlimited) | Seconds allowed for the whole quiz. |
| `shuffle_options` | boolean       | `false`     | Shuffle the **answer options** of `choice` questions, except those that set `shuffle_options: false` (see below). |
| `passing_score`   | number (0..1) | *(none)*    | Optional pass threshold as a fraction. |

> **Recommendation.** Put in the file only what is *pedagogically meaningful* (e.g.
> `order: fixed` when questions build on each other, or a `time_limit` for exam
> simulation). Leave pure UX preferences (shuffle, feedback timing) out and let the
> player decide — this also trims tokens when asking an LLM to generate a quiz.

---

## Categories & statistics

Give each question an optional `category` so that, at the end of an attempt, results
can be broken down per topic ("Verb tenses: 4/5 correct — Vocabulary: 2/5"). This
tells the learner what to focus on.

- The optional top-level `categories` array maps a category `id` to a display
  `label`.
- Each question's `category` references a `categories[].id`, **or** is just a
  free-form string if you don't want a registry.

```yaml
categories:
  - { id: tenses, label: "Verb tenses" }
  - { id: vocab,  label: "Vocabulary" }

questions:
  - { type: true_false, category: tenses, prompt: "...", answer: true }
```

---

## Option groups

Define reusable option sets once and reference them from many questions. This is a
token-saver and keeps consistent buckets (e.g. parts of speech) across a quiz.

```yaml
option_groups:
  parts_of_speech:
    - { id: adj,  text: "Adjective" }
    - { id: verb, text: "Verb" }
    - { id: noun, text: "Noun" }
```

- `choice` questions reference a group via `options_from: parts_of_speech`.
- `classify` questions reference a group as buckets via `groups_from: parts_of_speech`
  (each option's `id`/`text` become a bucket's id/label).

---

## Questions

`questions` is a list of 1..n items. Every question shares these common fields:

| Field         | Required | Type   | Notes |
|---------------|----------|--------|-------|
| `type`        | yes      | enum   | One of the 7 types below. |
| `prompt`      | yes      | string | Question text (Markdown). |
| `id`          | no       | string | Recommended for statistics / resume / referencing. |
| `category`    | no       | string | See [Categories & statistics](#categories--statistics). |
| `points`      | no       | number | Weight for scoring. Default `1`. |
| `explanation` | no       | string | Shown according to the `feedback` setting. |

Each type then adds its own fields.

### 1. `choice`

Single- or multiple-select multiple choice. Provide options inline **or** reference
an option group — exactly one of `options` / `options_from`.

| Field          | Required | Type            | Notes |
|----------------|----------|-----------------|-------|
| `select`       | no       | `single` \| `multiple` | Default `single`. |
| `options`      | one of\* | array of `{id, text}`  | Inline options (min 2). |
| `options_from` | one of\* | string          | Name of an `option_groups` entry. |
| `answer`       | yes      | id \| id[]      | Correct option id(s). A scalar is allowed for single-select. |
| `shuffle_options` | no    | boolean         | Default `true`. Set `false` to keep options in the authored order even when the quiz enables option shuffling — use this whenever an option refers to position, e.g. *"All of the above"* or *"Both A and B"*. |

```yaml
- type: choice
  select: single
  category: grammar
  prompt: "Which word is an **adjective**?"
  options:
    - { id: a, text: "quickly" }
    - { id: b, text: "beautiful" }
    - { id: c, text: "run" }
  answer: [b]
  explanation: "*beautiful* describes a noun; *quickly* is an adverb, *run* a verb."
```

### 2. `true_false`

| Field    | Required | Type    | Notes |
|----------|----------|---------|-------|
| `answer` | yes      | boolean | `true` or `false`. |

```yaml
- type: true_false
  prompt: "'Run' is a verb."
  answer: true
```

### 3. `fill_blank`

Placeholders are written as `{{id}}` inside the `prompt`. The `blanks` map pairs each
placeholder id with its definition. A blank is **either** free-text (`accept`) **or**
a per-blank choice (`options` + `answer`) — the "select the missing word" variant.
Multiple placeholders cover the "pair of words" case.

| Field    | Required | Type   | Notes |
|----------|----------|--------|-------|
| `blanks` | yes      | object | Map of placeholder id → blank definition (min 1). |

Blank definition — free-text form:

| Field            | Required | Type     | Notes |
|------------------|----------|----------|-------|
| `accept`         | yes      | string[] | Accepted answers / synonyms. |
| `case_sensitive` | no       | boolean  | Default `false`. |

Blank definition — choice form:

| Field     | Required | Type            | Notes |
|-----------|----------|-----------------|-------|
| `options` | yes      | array of `{id, text}` | Min 2. |
| `answer`  | yes      | string          | Correct option id. |

```yaml
- type: fill_blank
  prompt: "She {{1}} to school and {{2}} lunch there."
  blanks:
    "1": { accept: ["goes"] }
    "2": { accept: ["eats", "has"] }        # synonyms both accepted

- type: fill_blank
  prompt: "He {{1}} happy today."
  blanks:
    "1":
      options:
        - { id: a, text: "is" }
        - { id: b, text: "are" }
      answer: a
```

### 4. `classify`

Sort each item into the correct bucket. Buckets are called `groups` (to avoid
clashing with the top-level `categories` used for statistics). Provide `groups`
inline **or** reference an option group via `groups_from`.

| Field         | Required | Type            | Notes |
|---------------|----------|-----------------|-------|
| `groups`      | one of\* | array of `{id, label}` | Buckets (min 2). |
| `groups_from` | one of\* | string          | Name of an `option_groups` entry used as buckets. |
| `items`       | yes      | array of `{id, text, answer}` | `answer` is the target group id. |

```yaml
- type: classify
  prompt: "Classify each word by part of speech."
  groups:
    - { id: adj,  label: "Adjectives" }
    - { id: verb, label: "Verbs" }
  items:
    - { id: w1, text: "beautiful", answer: adj }
    - { id: w2, text: "run",       answer: verb }
```

### 5. `matching`

Pair each left item with its right counterpart.

| Field    | Required | Type            | Notes |
|----------|----------|-----------------|-------|
| `left`   | yes      | array of `{id, text}` | |
| `right`  | yes      | array of `{id, text}` | |
| `answer` | yes      | object          | Map of left id → right id. |

```yaml
- type: matching
  prompt: "Match each verb with its past form."
  left:
    - { id: l1, text: "go" }
    - { id: l2, text: "eat" }
  right:
    - { id: r1, text: "went" }
    - { id: r2, text: "ate" }
  answer: { l1: r1, l2: r2 }
```

### 6. `ordering`

Arrange items into the correct sequence.

| Field    | Required | Type            | Notes |
|----------|----------|-----------------|-------|
| `items`  | yes      | array of `{id, text}` | Min 2. |
| `answer` | yes      | string[]        | Item ids in correct order. |

```yaml
- type: ordering
  prompt: "Put the words in the correct order."
  items:
    - { id: a, text: "always" }
    - { id: b, text: "She" }
    - { id: c, text: "is late" }
  answer: [b, a, c]
```

### 7. `short_answer`

Free-text answer checked against an accepted list.

| Field            | Required | Type     | Notes |
|------------------|----------|----------|-------|
| `accept`         | yes      | string[] | Accepted answers / synonyms. |
| `case_sensitive` | no       | boolean  | Default `false`. |

```yaml
- type: short_answer
  prompt: "What is the past tense of *go*?"
  accept: ["went"]
```

\* *"one of"* means exactly one of the marked fields must be present.

---

## Versioning

- `schema_version` is `MAJOR.MINOR`.
- **Minor** bumps are backward-compatible additions (new optional fields, new
  question types). A v0.1 file must remain valid under later 0.x readers.
- **Major** bumps may remove or change existing fields; migration notes will
  accompany them.
- Readers should reject a file whose `schema_version` they do not support rather than
  guess.

---

## Full example

See [`examples/mixed-demo.yaml`](./examples/mixed-demo.yaml) for a single quiz that
exercises all seven question types together with `settings`, `option_groups`, and
`categories`. Per-type examples live in [`examples/`](./examples/).
