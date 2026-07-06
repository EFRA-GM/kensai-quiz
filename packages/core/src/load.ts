import yaml from "js-yaml";
import type { Quiz } from "./types.js";
import { validateQuiz, type ValidationIssue } from "./validate.js";

/** Thrown by `loadQuiz` when validation fails. Carries the error-severity issues. */
export class QuizValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    const detail = issues.map((i) => `  [${i.path}] ${i.message}`).join("\n");
    super(`Quiz validation failed with ${issues.length} error(s):\n${detail}`);
    this.name = "QuizValidationError";
    this.issues = issues;
  }
}

export type SourceFormat = "yaml" | "json";

/** Parse a quiz source string into a plain object. Does not validate. */
export function parseQuizSource(source: string, format: SourceFormat = "yaml"): unknown {
  return format === "json" ? JSON.parse(source) : yaml.load(source);
}

export interface LoadOptions {
  /** Source format when `source` is a string. Default: `"yaml"`. */
  format?: SourceFormat;
  /** Validate against the schema + references before returning. Default: `true`. */
  validate?: boolean;
}

/**
 * Load a quiz from a YAML/JSON string or an already-parsed object. Validates by
 * default and throws `QuizValidationError` on any error-severity issue.
 */
export function loadQuiz(source: string | object, options: LoadOptions = {}): Quiz {
  const { format = "yaml", validate = true } = options;
  const data = typeof source === "string" ? parseQuizSource(source, format) : source;
  if (validate) {
    const result = validateQuiz(data);
    if (!result.valid) throw new QuizValidationError(result.errors);
  }
  return data as Quiz;
}
