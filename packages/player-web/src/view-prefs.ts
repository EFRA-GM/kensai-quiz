/**
 * Per-quiz view-variant preference, remembered in this browser only.
 *
 * Some question types can be shown in more than one way (see `VIEW_VARIANTS` in
 * `views.ts`). When the learner switches the view for a type, we remember that
 * choice *per quiz* so replaying the same quiz keeps their preferred layout. This
 * is a purely presentational preference — it never affects answers or scoring.
 *
 * Storage shape (under one key): `{ [quizKey]: { [questionType]: variantId } }`.
 * `quizKey` is supplied by the caller (the player uses `metadata.id ?? title`).
 */
import { readJSON, writeJSON } from "./storage";

const VIEW_PREFS_KEY = "kensai-quiz-view-prefs";

type ViewPrefs = Record<string, Record<string, string>>;

/** The learner's saved variant for `(quizKey, type)`, or `null` if none. */
export function storedViewPref(quizKey: string, type: string): string | null {
  const all = readJSON<ViewPrefs>(VIEW_PREFS_KEY, {});
  const value = all[quizKey]?.[type];
  return typeof value === "string" ? value : null;
}

/** Remember the learner's variant for `(quizKey, type)` (best-effort). */
export function setViewPref(quizKey: string, type: string, variantId: string): void {
  const all = readJSON<ViewPrefs>(VIEW_PREFS_KEY, {});
  const forQuiz = { ...(all[quizKey] ?? {}), [type]: variantId };
  writeJSON(VIEW_PREFS_KEY, { ...all, [quizKey]: forQuiz });
}
