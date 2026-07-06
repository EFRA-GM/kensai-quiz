/**
 * @kensai/quiz-player — an embeddable, framework-free player for the Kensai Quiz
 * format. Renders into any host element and drives an `Attempt` from
 * `@kensai/quiz-core`.
 *
 * Two entry points, for the two ways to use it:
 *
 *   // 1. Controlled: the developer owns the quiz and behavior.
 *   import { init } from "@kensai/quiz-player";
 *   init("#quiz", { quiz: yamlString });
 *
 *   // 2. Playground: the learner loads/pastes their own quizzes (saved locally).
 *   import { library } from "@kensai/quiz-player";
 *   library("#app");
 *
 * CDN (single <script>, exposes `window.KensaiQuiz`):
 *   KensaiQuiz.init("#quiz", { quiz: yamlString });
 *   KensaiQuiz.library("#app");
 */
import { resolveTarget } from "./dom";
import { QuizPlayer, type PlayerOptions } from "./player";
import { QuizLibrary, type LibraryOptions } from "./library";

export const version = "0.2.0";

/**
 * Mount a quiz player into `target` (an element, a CSS selector, or a bare id).
 * `options.quiz` is optional — start empty and call `setQuiz`/`setQuestions` later.
 * Returns the `QuizPlayer` instance (`.setQuiz()`, `.setSettings()`, `.restart()`, …).
 */
export function init(target: string | HTMLElement, options: PlayerOptions = {}): QuizPlayer {
  return new QuizPlayer(resolveTarget(target), options);
}

/**
 * Mount a quiz library ("playground") into `target`. The learner uploads or pastes
 * quizzes, which are saved in this browser and replayable from a list.
 */
export function library(target: string | HTMLElement, options: LibraryOptions = {}): QuizLibrary {
  return new QuizLibrary(resolveTarget(target), options);
}

export { QuizPlayer };
export { QuizLibrary };
export type { PlayerOptions };
export type { LibraryOptions };
export type { EditableSettingKey } from "./settings-ui";
export type { Theme } from "./theme";
