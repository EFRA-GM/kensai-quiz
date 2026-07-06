import {
  resolveChoiceOptions,
  resolveGroups,
  type AnswerInput,
  type Option,
  type Question,
  type Quiz,
} from "@kensai/quiz-core";

const textById = (items: { id: string; text: string }[]): Map<string, string> =>
  new Map(items.map((i) => [i.id, i.text]));

const labelById = (items: { id: string; label: string }[]): Map<string, string> =>
  new Map(items.map((i) => [i.id, i.label]));

const lookup = (map: Map<string, string>, id: string): string => map.get(id) ?? id;

/** Human-readable Markdown description of a question's correct answer. */
export function correctAnswerText(quiz: Quiz, question: Question): string {
  switch (question.type) {
    case "choice": {
      const map = textById(resolveChoiceOptions(quiz, question));
      const ids = Array.isArray(question.answer) ? question.answer : [question.answer];
      return ids.map((id) => lookup(map, id)).join(", ");
    }
    case "true_false":
      return question.answer ? "True" : "False";
    case "short_answer":
      return question.accept.join(" / ");
    case "fill_blank":
      return Object.entries(question.blanks)
        .map(([key, blank]) => {
          if (blank.options && blank.answer !== undefined) {
            const map = textById(blank.options);
            return `${key}: ${lookup(map, blank.answer)}`;
          }
          return `${key}: ${(blank.accept ?? []).join(" / ")}`;
        })
        .join("; ");
    case "classify": {
      const groups = labelById(resolveGroups(quiz, question));
      return question.items
        .map((item) => `${item.text} → ${lookup(groups, item.answer)}`)
        .join("; ");
    }
    case "matching": {
      const left = textById(question.left);
      const right = textById(question.right);
      return Object.entries(question.answer)
        .map(([l, r]) => `${lookup(left, l)} → ${lookup(right, r)}`)
        .join("; ");
    }
    case "ordering": {
      const map = textById(question.items);
      return question.answer.map((id) => lookup(map, id)).join(" → ");
    }
    default:
      return "";
  }
}

/** Human-readable Markdown description of what the taker submitted (or a dash). */
export function userAnswerText(
  quiz: Quiz,
  question: Question,
  answer: AnswerInput | undefined,
): string {
  if (answer === undefined || answer === null) return "—";

  switch (question.type) {
    case "choice": {
      const map = textById(resolveChoiceOptions(quiz, question));
      const ids = Array.isArray(answer) ? answer : [String(answer)];
      return ids.length ? ids.map((id) => lookup(map, id)).join(", ") : "—";
    }
    case "true_false":
      return typeof answer === "boolean" ? (answer ? "True" : "False") : "—";
    case "short_answer":
      return typeof answer === "string" && answer.trim() ? answer : "—";
    case "fill_blank": {
      const given = asRecord(answer);
      const entries = Object.entries(given).filter(([, v]) => v !== undefined && v !== "");
      if (!entries.length) return "—";
      return entries
        .map(([key, value]) => {
          const blank = question.blanks[key];
          if (blank?.options) {
            const map = textById(blank.options);
            return `${key}: ${lookup(map, value)}`;
          }
          return `${key}: ${value}`;
        })
        .join("; ");
    }
    case "classify": {
      const groups = labelById(resolveGroups(quiz, question));
      const itemText = textById(question.items);
      const given = asRecord(answer);
      const entries = Object.entries(given);
      if (!entries.length) return "—";
      return entries
        .map(([itemId, groupId]) => `${lookup(itemText, itemId)} → ${lookup(groups, groupId)}`)
        .join("; ");
    }
    case "matching": {
      const left = textById(question.left);
      const right = textById(question.right);
      const given = asRecord(answer);
      const entries = Object.entries(given);
      if (!entries.length) return "—";
      return entries.map(([l, r]) => `${lookup(left, l)} → ${lookup(right, r)}`).join("; ");
    }
    case "ordering": {
      const map = textById(question.items);
      const ids = Array.isArray(answer) ? answer : [];
      return ids.length ? ids.map((id) => lookup(map, id)).join(" → ") : "—";
    }
    default:
      return "—";
  }
}

/** Plain-text option label list, useful for <select> options (no Markdown rendering). */
export function optionEntries(options: Option[]): { id: string; text: string }[] {
  return options.map((o) => ({ id: o.id, text: o.text }));
}

function asRecord(value: AnswerInput): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}
