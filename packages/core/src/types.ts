/**
 * Type definitions for the Kensai Quiz format (schema version 0.1).
 *
 * These types mirror `spec/quiz.schema.json`, which remains the authoritative
 * definition used for runtime validation. When the schema changes, keep these
 * types in sync (and re-run `pnpm sync:schema`).
 */

export type SchemaVersion = "0.1";

export type QuestionType =
  | "choice"
  | "true_false"
  | "fill_blank"
  | "classify"
  | "matching"
  | "ordering"
  | "short_answer";

export interface QuizMetadata {
  id?: string;
  title: string;
  path?: string;
  description?: string;
  language?: string;
  author?: string;
  tags?: string[];
}

export type NavigationMode = "all" | "sequential";
export type OrderMode = "fixed" | "random";
export type FeedbackMode = "immediate" | "on_finish";

export interface QuizSettings {
  navigation?: NavigationMode;
  order?: OrderMode;
  feedback?: FeedbackMode;
  /** Seconds allowed for the whole attempt. `null`/omitted = unlimited. */
  time_limit?: number | null;
  shuffle_options?: boolean;
  /** Pass threshold as a fraction 0..1. */
  passing_score?: number;
}

export interface Category {
  id: string;
  label: string;
}

export interface Option {
  id: string;
  text: string;
}

export interface Group {
  id: string;
  label: string;
}

export interface BaseQuestion {
  id?: string;
  category?: string;
  points?: number;
  prompt: string;
  explanation?: string;
}

export interface ChoiceQuestion extends BaseQuestion {
  type: "choice";
  select?: "single" | "multiple";
  options?: Option[];
  /** Name of an entry in `option_groups`. Mutually exclusive with `options`. */
  options_from?: string;
  answer: string | string[];
  /**
   * Whether these options may be reordered when the quiz enables option shuffling.
   * Default `true`; set `false` to lock the order (e.g. an "All of the above" option
   * or options that reference position like "Both A and B").
   */
  shuffle_options?: boolean;
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: "true_false";
  answer: boolean;
}

/** A blank is either free-text (`accept`) or a per-blank choice (`options` + `answer`). */
export interface Blank {
  accept?: string[];
  case_sensitive?: boolean;
  options?: Option[];
  answer?: string;
}

export interface FillBlankQuestion extends BaseQuestion {
  type: "fill_blank";
  /** Map of placeholder id ({{id}} in prompt) to a blank definition. */
  blanks: Record<string, Blank>;
}

export interface ClassifyItem {
  id: string;
  text: string;
  /** Target group id. */
  answer: string;
}

export interface ClassifyQuestion extends BaseQuestion {
  type: "classify";
  groups?: Group[];
  /** Name of an entry in `option_groups` used as buckets. Mutually exclusive with `groups`. */
  groups_from?: string;
  items: ClassifyItem[];
}

export interface MatchingQuestion extends BaseQuestion {
  type: "matching";
  left: Option[];
  right: Option[];
  /** Map of left id -> right id. */
  answer: Record<string, string>;
}

export interface OrderingQuestion extends BaseQuestion {
  type: "ordering";
  items: Option[];
  /** Item ids in the correct order. */
  answer: string[];
}

export interface ShortAnswerQuestion extends BaseQuestion {
  type: "short_answer";
  accept: string[];
  case_sensitive?: boolean;
}

export type Question =
  | ChoiceQuestion
  | TrueFalseQuestion
  | FillBlankQuestion
  | ClassifyQuestion
  | MatchingQuestion
  | OrderingQuestion
  | ShortAnswerQuestion;

export interface Quiz {
  schema_version: SchemaVersion;
  metadata: QuizMetadata;
  settings?: QuizSettings;
  /** Registry of categories used for end-of-quiz statistics. */
  categories?: Category[];
  /** Reusable named option sets, referenced via `options_from` / `groups_from`. */
  option_groups?: Record<string, Option[]>;
  questions: Question[];
}

/* ---------------------------------------------------------------------------
 * Answer inputs — what a taker submits for a question.
 * Keyed elsewhere by question id (falling back to the question index).
 * ------------------------------------------------------------------------- */

/** One option id (single-select) or a list of ids (multiple-select). */
export type ChoiceAnswer = string | string[];
export type TrueFalseAnswer = boolean;
/** Map of blank id -> submitted text (free-text) or selected option id. */
export type FillBlankAnswer = Record<string, string>;
/** Map of item id -> chosen group id. */
export type ClassifyAnswer = Record<string, string>;
/** Map of left id -> chosen right id. */
export type MatchingAnswer = Record<string, string>;
/** Item ids in the taker's chosen order. */
export type OrderingAnswer = string[];
export type ShortTextAnswer = string;

export type AnswerInput =
  | ChoiceAnswer
  | TrueFalseAnswer
  | FillBlankAnswer
  | ClassifyAnswer
  | MatchingAnswer
  | OrderingAnswer
  | ShortTextAnswer;
