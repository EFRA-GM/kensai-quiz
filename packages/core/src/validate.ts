import AjvModule from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { quizSchema } from "./schema.generated.js";
import type { Quiz } from "./types.js";
import { resolveChoiceOptions, resolveGroups } from "./resolve.js";

// ajv is published as CommonJS; under NodeNext the interop default can be the
// module namespace, so unwrap a possible nested `default` and construct via a
// typed alias exposing just the `compile` we use.
const Ajv2020 = ((AjvModule as unknown as { default?: unknown }).default ??
  AjvModule) as unknown as new (options?: Record<string, unknown>) => {
  compile: (schema: unknown) => ValidateFunction;
};

export type IssueSeverity = "error" | "warning";
export type IssueKind = "schema" | "reference";

export interface ValidationIssue {
  severity: IssueSeverity;
  kind: IssueKind;
  /** JSON-pointer-ish path to the offending node (e.g. `/questions/2/answer`). */
  path: string;
  message: string;
}

export interface ValidationResult {
  /** True when there are no error-severity issues (warnings are allowed). */
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// Ajv accepts unknown vocabulary keywords (`description`, `default`) with strict off.
const ajv = new Ajv2020({ allErrors: true, strict: false });
let compiled: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (!compiled) compiled = ajv.compile(quizSchema as unknown as object);
  return compiled;
}

/** Structural validation against the authoritative JSON Schema. */
export function validateSchema(data: unknown): ValidationIssue[] {
  const validate = getValidator();
  if (validate(data)) return [];
  return (validate.errors ?? []).map(fromAjvError);
}

function fromAjvError(error: ErrorObject): ValidationIssue {
  const path = error.instancePath || "/";
  const params =
    error.params && Object.keys(error.params).length
      ? " " + JSON.stringify(error.params)
      : "";
  return {
    severity: "error",
    kind: "schema",
    path,
    message: `${error.message ?? "invalid"}${params}`,
  };
}

/**
 * Referential-integrity checks that a JSON Schema cannot express: answers point at
 * existing ids, `*_from` names resolve, placeholders match blanks, ids are unique,
 * etc. Assumes `quiz` already passed schema validation.
 */
export function validateReferences(quiz: Quiz): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (severity: IssueSeverity, path: string, message: string) =>
    issues.push({ severity, kind: "reference", path, message });

  const declaredCategories = new Set((quiz.categories ?? []).map((c) => c.id));
  const seenQuestionIds = new Set<string>();

  quiz.questions.forEach((question, i) => {
    const base = `/questions/${i}`;

    if (question.id) {
      if (seenQuestionIds.has(question.id)) {
        add("error", `${base}/id`, `Duplicate question id "${question.id}".`);
      }
      seenQuestionIds.add(question.id);
    }

    if (question.category && quiz.categories && !declaredCategories.has(question.category)) {
      add(
        "warning",
        `${base}/category`,
        `Category "${question.category}" is not declared in categories[].`,
      );
    }

    switch (question.type) {
      case "choice": {
        if (
          question.options_from &&
          !(quiz.option_groups && question.options_from in quiz.option_groups)
        ) {
          add(
            "error",
            `${base}/options_from`,
            `option_groups has no entry "${question.options_from}".`,
          );
        }
        const options = resolveChoiceOptions(quiz, question);
        reportDuplicateIds(options.map((o) => o.id), `${base}/options`, add);
        const optionIds = new Set(options.map((o) => o.id));
        const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
        for (const answerId of answers) {
          if (!optionIds.has(answerId)) {
            add("error", `${base}/answer`, `Answer id "${answerId}" is not among the options.`);
          }
        }
        if ((question.select ?? "single") === "single" && answers.length !== 1) {
          add("error", `${base}/answer`, `A single-select choice must have exactly one answer.`);
        }
        break;
      }

      case "fill_blank": {
        const placeholders = extractPlaceholders(question.prompt);
        for (const [key, blank] of Object.entries(question.blanks)) {
          if (!placeholders.has(key)) {
            add(
              "warning",
              `${base}/blanks/${key}`,
              `Blank "${key}" has no {{${key}}} placeholder in the prompt.`,
            );
          }
          if (blank.options && blank.answer !== undefined) {
            if (!blank.options.some((o) => o.id === blank.answer)) {
              add(
                "error",
                `${base}/blanks/${key}/answer`,
                `Answer "${blank.answer}" is not among the blank options.`,
              );
            }
          }
        }
        for (const placeholder of placeholders) {
          if (!(placeholder in question.blanks)) {
            add(
              "warning",
              `${base}/prompt`,
              `Placeholder {{${placeholder}}} has no matching blank definition.`,
            );
          }
        }
        break;
      }

      case "classify": {
        if (
          question.groups_from &&
          !(quiz.option_groups && question.groups_from in quiz.option_groups)
        ) {
          add(
            "error",
            `${base}/groups_from`,
            `option_groups has no entry "${question.groups_from}".`,
          );
        }
        const groupIds = new Set(resolveGroups(quiz, question).map((g) => g.id));
        reportDuplicateIds(question.items.map((it) => it.id), `${base}/items`, add);
        question.items.forEach((item, j) => {
          if (!groupIds.has(item.answer)) {
            add(
              "error",
              `${base}/items/${j}/answer`,
              `Item answer "${item.answer}" is not a declared group.`,
            );
          }
        });
        break;
      }

      case "matching": {
        const leftIds = new Set(question.left.map((o) => o.id));
        const rightIds = new Set(question.right.map((o) => o.id));
        for (const [leftId, rightId] of Object.entries(question.answer)) {
          if (!leftIds.has(leftId)) {
            add("error", `${base}/answer`, `Answer key "${leftId}" is not a left id.`);
          }
          if (!rightIds.has(rightId)) {
            add("error", `${base}/answer`, `Answer value "${rightId}" is not a right id.`);
          }
        }
        break;
      }

      case "ordering": {
        const itemIds = question.items.map((o) => o.id);
        reportDuplicateIds(itemIds, `${base}/items`, add);
        const itemIdSet = new Set(itemIds);
        const answerSet = new Set(question.answer);
        const isPermutation =
          question.answer.length === itemIds.length &&
          itemIds.every((id) => answerSet.has(id)) &&
          question.answer.every((id) => itemIdSet.has(id));
        if (!isPermutation) {
          add("error", `${base}/answer`, "Ordering answer must be a permutation of all item ids.");
        }
        break;
      }

      default:
        break;
    }
  });

  return issues;
}

/** Full validation: schema first, then referential integrity (only if the shape is valid). */
export function validateQuiz(data: unknown): ValidationResult {
  let issues = validateSchema(data);
  if (issues.length === 0) {
    issues = issues.concat(validateReferences(data as Quiz));
  }
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { valid: errors.length === 0, issues, errors, warnings };
}

const PLACEHOLDER_RE = /\{\{\s*([^}\s]+)\s*\}\}/g;

function extractPlaceholders(prompt: string): Set<string> {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((match = PLACEHOLDER_RE.exec(prompt)) !== null) {
    found.add(match[1]!);
  }
  return found;
}

function reportDuplicateIds(
  ids: string[],
  path: string,
  add: (severity: IssueSeverity, path: string, message: string) => void,
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) add("error", path, `Duplicate id "${id}".`);
    seen.add(id);
  }
}
