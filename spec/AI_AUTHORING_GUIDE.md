# AI Authoring Guide — Kensai Quiz (v0.1)

Paste this whole file into an LLM chat, then ask for a quiz, e.g.:

> "Using the Kensai Quiz format below, generate a quiz. Study path:
> *English / Verb system / Present simple vs continuous*. 8 questions, mixed types,
> A2 level. Output only the YAML."

## Hard rules

1. Output **valid YAML**, nothing else (no prose around it).
2. Field names are **`snake_case`**.
3. `schema_version: "0.1"` and a `metadata.title` are **required**; `questions` must
   have at least one item.
4. **All text may use Markdown** (`prompt`, `explanation`, `title`, option/item text).
5. **Answers reference ids, not text.** Give options short ids (`a`, `b`, `w1`) and
   put those ids in `answer`. Never repeat the option text in the answer.
6. `settings` is **optional** — include it only when a behavior matters (e.g. a time
   limit for exam practice); otherwise omit it to keep the file small.
7. Give each question a `category` when you want end-of-quiz stats per topic.
8. Use one of the **7 types** below. Match the type to the exercise.
9. On a `choice` question whose options refer to position — *"All of the above"*,
   *"Both A and B"*, *"None of these"* — add `shuffle_options: false` so the order is
   never shuffled. Otherwise leave it out (options may be shuffled; that's the default).

## Skeleton

```yaml
schema_version: "0.1"
metadata:
  title: "<title>"
  path: "<Subject / Topic / Subtopic>"    # study-path breadcrumb
  language: en
  tags: [<tag>, <tag>]
# settings:            # optional — omit unless needed
#   feedback: on_finish
#   time_limit: 600
categories:            # optional — enables per-topic statistics
  - { id: <cat_id>, label: "<Label>" }
option_groups:         # optional — reuse option sets across questions
  <group_name>:
    - { id: <id>, text: "<text>" }
questions:
  - # one of the types below
```

## The 7 question types

```yaml
# 1. choice — single or multiple select
- type: choice
  select: single            # single | multiple (default single)
  category: <cat_id>
  prompt: "Which word is an **adjective**?"
  options:
    - { id: a, text: "quickly" }
    - { id: b, text: "beautiful" }
    - { id: c, text: "run" }
  answer: [b]               # list of correct ids
  explanation: "..."        # optional
  # shuffle_options: false  # add ONLY when an option says "All of the above" etc.
  # Instead of inline options: `options_from: <group_name>`

# 2. true_false
- type: true_false
  prompt: "'Run' is a verb."
  answer: true

# 3. fill_blank — placeholders {{id}} in the prompt
- type: fill_blank
  prompt: "She {{1}} to school and {{2}} lunch there."
  blanks:
    "1": { accept: ["goes"] }                 # free text (+ synonyms)
    "2": { accept: ["eats", "has"] }
  # choice-per-blank variant:
  #   "1": { options: [ {id: a, text: "is"}, {id: b, text: "are"} ], answer: a }

# 4. classify — sort items into buckets (called `groups`)
- type: classify
  prompt: "Classify each word by part of speech."
  groups:
    - { id: adj,  label: "Adjectives" }
    - { id: verb, label: "Verbs" }
  items:
    - { id: w1, text: "beautiful", answer: adj }
    - { id: w2, text: "run",       answer: verb }
  # Or reuse a group: `groups_from: <group_name>`

# 5. matching — pair left with right
- type: matching
  prompt: "Match each verb with its past form."
  left:  [ { id: l1, text: "go" }, { id: l2, text: "eat" } ]
  right: [ { id: r1, text: "went" }, { id: r2, text: "ate" } ]
  answer: { l1: r1, l2: r2 }

# 6. ordering — arrange into correct sequence
- type: ordering
  prompt: "Put the words in the correct order."
  items: [ { id: a, text: "always" }, { id: b, text: "She" }, { id: c, text: "is late" } ]
  answer: [b, a, c]

# 7. short_answer — free text against an accepted list
- type: short_answer
  prompt: "What is the past tense of *go*?"
  accept: ["went"]
  case_sensitive: false
```

## One complete example

```yaml
schema_version: "0.1"
metadata:
  title: "Present Simple — Basics"
  path: "English / Verb system / Present simple"
  language: en
  tags: [grammar, a2]
categories:
  - { id: form,  label: "Verb form" }
  - { id: usage, label: "Usage" }
questions:
  - type: choice
    category: form
    prompt: "Choose the correct form: *She ___ coffee every morning.*"
    options:
      - { id: a, text: "drink" }
      - { id: b, text: "drinks" }
      - { id: c, text: "drinking" }
    answer: [b]
    explanation: "Third-person singular takes **-s** in the present simple."
  - type: true_false
    category: usage
    prompt: "The present simple is used for habits and routines."
    answer: true
  - type: fill_blank
    category: form
    prompt: "They {{1}} (not/like) spicy food."
    blanks:
      "1": { accept: ["don't like", "do not like"] }
  - type: classify
    category: form
    prompt: "Group each verb by its third-person-singular spelling change."
    groups:
      - { id: s,   label: "adds -s" }
      - { id: es,  label: "adds -es" }
      - { id: ies, label: "y → -ies" }
    items:
      - { id: v1, text: "play → plays",  answer: s }
      - { id: v2, text: "watch → watches", answer: es }
      - { id: v3, text: "study → studies", answer: ies }
  - type: short_answer
    category: form
    prompt: "Write the third-person singular of *go*."
    accept: ["goes"]
```

When you are done, output only the YAML for the requested quiz.
