import type {
  FeedbackMode,
  NavigationMode,
  OrderMode,
  QuizSettings,
} from "./types.js";

/** A fully-resolved settings object, with every field present. */
export interface ResolvedSettings {
  navigation: NavigationMode;
  order: OrderMode;
  feedback: FeedbackMode;
  time_limit: number | null;
  shuffle_options: boolean;
  passing_score: number | null;
}

/** Defaults applied when `settings` (or a given field) is omitted. */
export const DEFAULT_SETTINGS: ResolvedSettings = {
  navigation: "all",
  order: "fixed",
  feedback: "on_finish",
  time_limit: null,
  shuffle_options: false,
  passing_score: null,
};

/**
 * Merge authored settings and optional per-attempt overrides over the documented
 * defaults. `undefined` fields are ignored (so partial overrides are safe);
 * explicit `null` is kept (e.g. to clear a time limit).
 */
export function resolveSettings(
  authored?: QuizSettings,
  overrides?: Partial<ResolvedSettings>,
): ResolvedSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...omitUndefined(authored),
    ...omitUndefined(overrides),
  };
}

function omitUndefined<T extends object>(obj?: T): Partial<T> {
  if (!obj) return {};
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}
