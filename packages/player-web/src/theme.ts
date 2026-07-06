/**
 * Light / dark theme handling shared by the player and the library shell.
 *
 * The default follows the OS via `prefers-color-scheme`; once the learner picks a
 * theme it is remembered (in this browser only) and takes precedence. Applying a
 * theme just toggles a `kq-theme-light` / `kq-theme-dark` class on the root — the
 * CSS variables in `styles.ts` do the rest, and the class cascades into any nested
 * `.kq-root` (e.g. the player mounted inside the library).
 */
import { el } from "./dom";
import { readJSON, writeJSON } from "./storage";

export type Theme = "light" | "dark";

const THEME_KEY = "kensai-quiz-theme";

/** The learner's explicit choice, or `null` when they haven't picked one. */
export function storedTheme(): Theme | null {
  const value = readJSON<Theme | null>(THEME_KEY, null);
  return value === "light" || value === "dark" ? value : null;
}

/** What the OS currently prefers (defaults to light when unknown). */
export function systemTheme(): Theme {
  if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/** The theme in effect: the explicit choice if any, else the OS preference. */
export function resolvedTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Remember the learner's choice for next time (best-effort). */
export function setStoredTheme(theme: Theme): void {
  writeJSON(THEME_KEY, theme);
}

/** Reflect `theme` on `root` by toggling the theme classes. */
export function applyTheme(root: HTMLElement, theme: Theme = resolvedTheme()): void {
  root.classList.remove("kq-theme-light", "kq-theme-dark");
  root.classList.add(theme === "dark" ? "kq-theme-dark" : "kq-theme-light");
}

/**
 * Build a ☀ / 🌙 toggle button. Clicking flips the theme, persists it, and calls
 * `onChange` with the newly selected theme so the caller can re-apply / re-render.
 */
export function themeButton(onChange: (theme: Theme) => void): HTMLButtonElement {
  const current = resolvedTheme();
  const next: Theme = current === "dark" ? "light" : "dark";
  return el(
    "button",
    {
      type: "button",
      class: "kq-icon-btn",
      title: `Switch to ${next} theme`,
      "aria-label": `Switch to ${next} theme`,
      onclick: () => {
        setStoredTheme(next);
        onChange(next);
      },
    },
    current === "dark" ? "☀" : "🌙",
  ) as HTMLButtonElement;
}
