import {
  resolveChoiceOptions,
  resolveGroups,
  textMatches,
  type AnswerInput,
  type Option,
  type Question,
  type Quiz,
} from "@kensai/quiz-core";
import { clear, el, mdEl } from "./dom";
import { renderInlineMarkdown } from "./markdown";

/** One selectable presentation for a question type. */
export interface ViewVariantDef {
  id: string;
  label: string;
}

/**
 * Question types that offer more than one presentation. The first entry is the
 * built-in default. Types absent here have a single, fixed view. Adding a variant
 * later = add an entry plus its builder in `buildBody`.
 */
export const VIEW_VARIANTS: Partial<Record<Question["type"], ViewVariantDef[]>> = {
  classify: [
    { id: "dropdown", label: "Dropdown" },
    { id: "buckets", label: "Word bank" },
  ],
};

/** Available variants for a type (empty when it has a single fixed view). */
export function variantsFor(type: Question["type"]): ViewVariantDef[] {
  return VIEW_VARIANTS[type] ?? [];
}

export interface QuestionView {
  /** The rendered element to place in the DOM. */
  element: HTMLElement;
  /** Read the current answer, or `undefined` when nothing is entered. */
  getAnswer(): AnswerInput | undefined;
  /** Restore a previously stored answer into the inputs. */
  setAnswer(answer: AnswerInput | undefined): void;
  /** Enable/disable all inputs (e.g. after checking in immediate-feedback mode). */
  setDisabled(disabled: boolean): void;
  /** Reveal per-item/-option correctness (green/red) after checking. Optional —
   *  a type that cannot show granular feedback simply omits it. */
  markResults?(): void;
}

/** Tag an element as correct or incorrect for feedback coloring. */
function mark(node: Element | null, correct: boolean): void {
  if (!(node instanceof HTMLElement)) return;
  node.classList.remove("kq-correct", "kq-incorrect");
  node.classList.add(correct ? "kq-correct" : "kq-incorrect");
}

/**
 * Build an interactive view for any question type. `options` (when given) overrides
 * the presentation order of a choice question's options — the player passes the
 * attempt's stable shuffled order here. `variant` selects among a type's alternative
 * presentations (see `VIEW_VARIANTS`); unknown/omitted falls back to the default.
 */
export function createQuestionView(
  quiz: Quiz,
  question: Question,
  index: number,
  options?: Option[],
  variant?: string,
): QuestionView {
  const body = el("div", { class: "kq-question-body" });
  // fill_blank renders its prompt inline (with the inputs embedded), so skip the
  // generic prompt heading for it to avoid showing the raw `{{id}}` placeholders twice.
  const showPrompt = question.type !== "fill_blank";
  const wrapper = el(
    "div",
    { class: "kq-question", "data-type": question.type },
    showPrompt ? mdEl("div", question.prompt, "kq-prompt") : null,
    body,
  );

  const view = buildBody(quiz, question, index, body, options, variant);
  return { element: wrapper, ...view };
}

type ViewParts = Omit<QuestionView, "element">;

function buildBody(
  quiz: Quiz,
  question: Question,
  index: number,
  body: HTMLElement,
  options?: Option[],
  variant?: string,
): ViewParts {
  switch (question.type) {
    case "choice":
      return choiceView(quiz, question, index, body, options);
    case "true_false":
      return trueFalseView(question, index, body);
    case "short_answer":
      return shortAnswerView(question, index, body);
    case "fill_blank":
      return fillBlankView(question, index, body);
    case "classify":
      return variant === "buckets"
        ? classifyBucketsView(quiz, question, body)
        : classifyView(quiz, question, body);
    case "matching":
      return matchingView(question, body);
    case "ordering":
      return orderingView(question, body);
    default:
      return { getAnswer: () => undefined, setAnswer: () => {}, setDisabled: () => {} };
  }
}

/* ------------------------------------------------------------------ choice */

function choiceView(
  quiz: Quiz,
  question: Extract<Question, { type: "choice" }>,
  index: number,
  body: HTMLElement,
  options?: Option[],
): ViewParts {
  const multiple = question.select === "multiple";
  const name = `kq-q${index}`;
  const inputs: HTMLInputElement[] = [];

  for (const option of options ?? resolveChoiceOptions(quiz, question)) {
    const input = el("input", {
      type: multiple ? "checkbox" : "radio",
      name,
      value: option.id,
      class: "kq-input",
    }) as HTMLInputElement;
    inputs.push(input);
    body.append(
      el("label", { class: "kq-option" }, input, mdEl("span", option.text, "kq-option-text")),
    );
  }

  return {
    getAnswer() {
      if (multiple) {
        const chosen = inputs.filter((i) => i.checked).map((i) => i.value);
        return chosen.length ? chosen : undefined;
      }
      return inputs.find((i) => i.checked)?.value;
    },
    setAnswer(answer) {
      const ids = new Set(Array.isArray(answer) ? answer : answer != null ? [String(answer)] : []);
      for (const input of inputs) input.checked = ids.has(input.value);
    },
    setDisabled(disabled) {
      for (const input of inputs) input.disabled = disabled;
    },
    markResults() {
      const expected = new Set(Array.isArray(question.answer) ? question.answer : [question.answer]);
      for (const input of inputs) {
        // Every correct option is shown green (so the learner sees the answer);
        // a wrong option is shown red only if they actually chose it.
        if (expected.has(input.value)) mark(input.closest(".kq-option"), true);
        else if (input.checked) mark(input.closest(".kq-option"), false);
      }
    },
  };
}

/* -------------------------------------------------------------- true_false */

function trueFalseView(
  question: Extract<Question, { type: "true_false" }>,
  index: number,
  body: HTMLElement,
): ViewParts {
  const name = `kq-q${index}`;
  const make = (value: "true" | "false", label: string) => {
    const input = el("input", { type: "radio", name, value, class: "kq-input" }) as HTMLInputElement;
    body.append(el("label", { class: "kq-option" }, input, el("span", { text: label })));
    return input;
  };
  const yes = make("true", "True");
  const no = make("false", "False");

  return {
    getAnswer() {
      if (yes.checked) return true;
      if (no.checked) return false;
      return undefined;
    },
    setAnswer(answer) {
      yes.checked = answer === true;
      no.checked = answer === false;
    },
    setDisabled(disabled) {
      yes.disabled = disabled;
      no.disabled = disabled;
    },
    markResults() {
      for (const [input, value] of [[yes, true], [no, false]] as const) {
        if (value === question.answer) mark(input.closest(".kq-option"), true);
        else if (input.checked) mark(input.closest(".kq-option"), false);
      }
    },
  };
}

/* ------------------------------------------------------------ short_answer */

function shortAnswerView(
  question: Extract<Question, { type: "short_answer" }>,
  index: number,
  body: HTMLElement,
): ViewParts {
  const input = el("input", {
    type: "text",
    class: "kq-text",
    name: `kq-q${index}`,
    autocomplete: "off",
    placeholder: "Type your answer…",
  }) as HTMLInputElement;
  body.append(input);

  return {
    getAnswer() {
      return input.value.trim() ? input.value : undefined;
    },
    setAnswer(answer) {
      input.value = typeof answer === "string" ? answer : "";
    },
    setDisabled(disabled) {
      input.disabled = disabled;
    },
    markResults() {
      mark(input, textMatches(input.value, question.accept, question.case_sensitive ?? false));
    },
  };
}

/* -------------------------------------------------------------- fill_blank */

function fillBlankView(
  question: Extract<Question, { type: "fill_blank" }>,
  index: number,
  body: HTMLElement,
): ViewParts {
  const fields = new Map<string, HTMLInputElement | HTMLSelectElement>();

  const makeField = (key: string, blank: (typeof question.blanks)[string]) => {
    let field: HTMLInputElement | HTMLSelectElement;
    if (blank.options) {
      field = el("select", { class: "kq-select", name: `kq-q${index}-${key}` }) as HTMLSelectElement;
      field.append(el("option", { value: "", text: "—" }));
      for (const option of blank.options) {
        field.append(el("option", { value: option.id, text: option.text }));
      }
    } else {
      field = el("input", {
        type: "text",
        class: "kq-text kq-text-inline",
        name: `kq-q${index}-${key}`,
        autocomplete: "off",
        "aria-label": `Blank ${key}`,
      }) as HTMLInputElement;
    }
    fields.set(key, field);
    return field;
  };

  // Render the prompt inline, splitting on {{id}} and dropping the input/select in place.
  const sentence = el("p", { class: "kq-fill-inline" });
  const placeholderRe = /\{\{\s*([^}\s]+)\s*\}\}/g;
  const used = new Set<string>();
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = placeholderRe.exec(question.prompt)) !== null) {
    const [full, key] = match;
    const before = question.prompt.slice(lastIndex, match.index);
    if (before) sentence.append(el("span", { html: renderInlineMarkdown(before) }));
    const blank = question.blanks[key!];
    if (blank) {
      sentence.append(makeField(key!, blank));
      used.add(key!);
    } else {
      sentence.append(el("span", { text: full }));
    }
    lastIndex = match.index + full.length;
  }
  const tail = question.prompt.slice(lastIndex);
  if (tail) sentence.append(el("span", { html: renderInlineMarkdown(tail) }));
  body.append(sentence);

  // Any blank without a matching placeholder falls back to a labeled field below.
  const leftover = Object.entries(question.blanks).filter(([key]) => !used.has(key));
  if (leftover.length) {
    const controls = el("div", { class: "kq-fill-controls" });
    for (const [key, blank] of leftover) {
      controls.append(
        el("label", { class: "kq-fill-field" }, el("span", { class: "kq-blank-key", text: `[${key}]` }), makeField(key, blank)),
      );
    }
    body.append(controls);
  }

  return {
    getAnswer() {
      const out: Record<string, string> = {};
      for (const [key, field] of fields) {
        const value = field.value.trim();
        if (value) out[key] = value;
      }
      return Object.keys(out).length ? out : undefined;
    },
    setAnswer(answer) {
      const given = asRecord(answer);
      for (const [key, field] of fields) field.value = given[key] ?? "";
    },
    setDisabled(disabled) {
      for (const field of fields.values()) field.disabled = disabled;
    },
    markResults() {
      for (const [key, field] of fields) {
        const blank = question.blanks[key]!;
        const value = field.value;
        const ok =
          blank.options && blank.answer !== undefined
            ? value === blank.answer
            : !!blank.accept &&
              value.trim() !== "" &&
              textMatches(value, blank.accept, blank.case_sensitive ?? false);
        mark(field, ok);
      }
    },
  };
}

/* ---------------------------------------------------------------- classify */

function classifyView(
  quiz: Quiz,
  question: Extract<Question, { type: "classify" }>,
  body: HTMLElement,
): ViewParts {
  const groups = resolveGroups(quiz, question);
  const selects = new Map<string, HTMLSelectElement>();

  for (const item of question.items) {
    const select = el("select", { class: "kq-select" }) as HTMLSelectElement;
    select.append(el("option", { value: "", text: "—" }));
    for (const group of groups) select.append(el("option", { value: group.id, text: group.label }));
    selects.set(item.id, select);
    body.append(
      el("div", { class: "kq-row" }, mdEl("span", item.text, "kq-row-label"), select),
    );
  }

  const answerOf = new Map(question.items.map((i) => [i.id, i.answer]));
  return recordSelectParts(selects, (id) => answerOf.get(id));
}

/**
 * The "word bank" variant of classify: every item is a chip in a pool at the top;
 * each group is a drop-zone below. Interaction is tap-to-place (no drag), so it
 * behaves the same on touch and desktop and is keyboard-operable: tap a chip to
 * select it, then tap a group (or the pool) to move it there. The answer shape is
 * identical to the dropdown variant (`Record<itemId, groupId>`).
 */
function classifyBucketsView(
  quiz: Quiz,
  question: Extract<Question, { type: "classify" }>,
  body: HTMLElement,
): ViewParts {
  const groups = resolveGroups(quiz, question);
  const itemLabels = new Map(question.items.map((i) => [i.id, i.text]));
  const answerOf = new Map(question.items.map((i) => [i.id, i.answer]));
  const assignments = new Map<string, string | null>(question.items.map((i) => [i.id, null]));
  let selected: string | null = null;
  let disabled = false;
  let revealed = false;

  const wrap = el("div", { class: "kq-buckets" });
  body.append(wrap);

  const chip = (id: string): HTMLElement => {
    const isSelected = selected === id;
    const result = revealed ? (assignments.get(id) === answerOf.get(id) ? " kq-correct" : " kq-incorrect") : "";
    return el("button", {
      type: "button",
      class: `kq-chip${isSelected ? " kq-selected" : ""}${result}`,
      "aria-pressed": isSelected ? "true" : "false",
      disabled,
      onclick: (e: Event) => {
        e.stopPropagation();
        if (disabled) return;
        selected = isSelected ? null : id;
        renderBoard();
      },
    }, mdEl("span", itemLabels.get(id) ?? id));
  };

  const zone = (
    groupId: string | null,
    label: string,
    className: string,
    ariaLabel: string,
  ): HTMLElement => {
    const members = [...assignments.entries()]
      .filter(([, g]) => g === groupId)
      .map(([itemId]) => itemId);
    const placeable = selected !== null && !disabled;
    const box = el("div", {
      class: `${className}${placeable ? " kq-droppable" : ""}`,
      role: "button",
      tabindex: disabled ? "-1" : "0",
      "aria-label": ariaLabel,
      onclick: () => place(groupId),
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          place(groupId);
        }
      },
    });
    for (const itemId of members) box.append(chip(itemId));
    if (!members.length) box.append(el("span", { class: "kq-zone-empty", text: "—" }));
    return box;
  };

  function place(groupId: string | null): void {
    if (disabled || selected === null) return;
    assignments.set(selected, groupId);
    selected = null;
    renderBoard();
  }

  function renderBoard(): void {
    clear(wrap);
    wrap.append(zone(null, "Words", "kq-pool", "Return selected word to the word bank"));
    const groupsEl = el("div", { class: "kq-groups" });
    for (const group of groups) {
      groupsEl.append(
        el(
          "div",
          { class: "kq-group" },
          mdEl("div", group.label, "kq-group-label"),
          zone(group.id, group.label, "kq-group-drop", `Place selected word in ${group.label}`),
        ),
      );
    }
    wrap.append(groupsEl);
  }

  renderBoard();

  return {
    getAnswer() {
      const out: Record<string, string> = {};
      for (const [itemId, groupId] of assignments) if (groupId) out[itemId] = groupId;
      return Object.keys(out).length ? out : undefined;
    },
    setAnswer(answer) {
      const given = asRecord(answer);
      const known = new Set(groups.map((g) => g.id));
      for (const itemId of assignments.keys()) {
        const g = given[itemId];
        assignments.set(itemId, g && known.has(g) ? g : null);
      }
      selected = null;
      renderBoard();
    },
    setDisabled(value) {
      disabled = value;
      selected = null;
      renderBoard();
    },
    markResults() {
      revealed = true;
      renderBoard();
    },
  };
}

/* ---------------------------------------------------------------- matching */

function matchingView(
  question: Extract<Question, { type: "matching" }>,
  body: HTMLElement,
): ViewParts {
  const selects = new Map<string, HTMLSelectElement>();

  for (const left of question.left) {
    const select = el("select", { class: "kq-select" }) as HTMLSelectElement;
    select.append(el("option", { value: "", text: "—" }));
    for (const right of question.right) {
      select.append(el("option", { value: right.id, text: right.text }));
    }
    selects.set(left.id, select);
    body.append(
      el("div", { class: "kq-row" }, mdEl("span", left.text, "kq-row-label"), select),
    );
  }

  return recordSelectParts(selects, (key) => question.answer[key]);
}

/**
 * Shared getAnswer/setAnswer/setDisabled for the id→select map (classify, matching).
 * `correctFor` (when given) yields the expected value per key so `markResults` can
 * colour each row green/red after checking.
 */
function recordSelectParts(
  selects: Map<string, HTMLSelectElement>,
  correctFor?: (key: string) => string | undefined,
): ViewParts {
  return {
    getAnswer() {
      const out: Record<string, string> = {};
      for (const [key, select] of selects) if (select.value) out[key] = select.value;
      return Object.keys(out).length ? out : undefined;
    },
    setAnswer(answer) {
      const given = asRecord(answer);
      for (const [key, select] of selects) select.value = given[key] ?? "";
    },
    setDisabled(disabled) {
      for (const select of selects.values()) select.disabled = disabled;
    },
    markResults() {
      if (!correctFor) return;
      for (const [key, select] of selects) {
        mark(select.closest(".kq-row"), select.value !== "" && select.value === correctFor(key));
      }
    },
  };
}

/* ---------------------------------------------------------------- ordering */

function orderingView(
  question: Extract<Question, { type: "ordering" }>,
  body: HTMLElement,
): ViewParts {
  let order = question.items.map((i) => i.id);
  const labels = new Map(question.items.map((i) => [i.id, i.text]));
  let disabled = false;
  let revealed = false;
  const list = el("ol", { class: "kq-ordering" });

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= order.length) return;
    const next = order.slice();
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    order = next;
    renderList();
  };

  function renderList() {
    clear(list);
    order.forEach((id, position) => {
      const up = el("button", {
        type: "button",
        class: "kq-move",
        "aria-label": "Move up",
        disabled: disabled || position === 0,
        onclick: () => move(position, position - 1),
      }, "▲");
      const down = el("button", {
        type: "button",
        class: "kq-move",
        "aria-label": "Move down",
        disabled: disabled || position === order.length - 1,
        onclick: () => move(position, position + 1),
      }, "▼");
      const result = revealed ? (id === question.answer[position] ? " kq-correct" : " kq-incorrect") : "";
      list.append(
        el(
          "li",
          { class: `kq-ordering-item${result}` },
          mdEl("span", labels.get(id) ?? id, "kq-row-label"),
          el("span", { class: "kq-move-group" }, up, down),
        ),
      );
    });
  }

  renderList();
  body.append(list);

  return {
    getAnswer() {
      return order.slice();
    },
    setAnswer(answer) {
      if (Array.isArray(answer) && answer.length) {
        const known = new Set(labels.keys());
        const filtered = answer.filter((id): id is string => typeof id === "string" && known.has(id));
        const missing = order.filter((id) => !filtered.includes(id));
        order = [...filtered, ...missing];
        renderList();
      }
    },
    setDisabled(value) {
      disabled = value;
      renderList();
    },
    markResults() {
      revealed = true;
      renderList();
    },
  };
}

function asRecord(value: AnswerInput | undefined): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}
