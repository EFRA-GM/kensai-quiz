const STYLE_ID = "kq-styles";

/** Inject the player stylesheet once per document. Theme via the `--kq-*` variables. */
export function injectStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

const CSS = `
.kq-root {
  --kq-bg: #ffffff;
  --kq-fg: #1a1a2e;
  --kq-muted: #6b7280;
  --kq-border: #e5e7eb;
  --kq-accent: #4f46e5;
  --kq-accent-fg: #ffffff;
  --kq-correct: #16a34a;
  --kq-incorrect: #dc2626;
  --kq-partial: #d97706;
  --kq-surface: #f9fafb;
  --kq-radius: 12px;

  box-sizing: border-box;
  color: var(--kq-fg);
  background: var(--kq-bg);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.25rem;
  border: 1px solid var(--kq-border);
  border-radius: var(--kq-radius);
}
.kq-root *, .kq-root *::before, .kq-root *::after { box-sizing: inherit; }

.kq-header { border-bottom: 1px solid var(--kq-border); padding-bottom: 0.75rem; margin-bottom: 1rem; }
.kq-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
.kq-title { font-size: 1.4rem; font-weight: 700; margin: 0; }

/* header controls: ⚙ settings + ⛶ fullscreen */
.kq-controls { display: flex; gap: 0.4rem; flex: none; }
.kq-icon-btn { font: inherit; font-size: 1.1rem; line-height: 1; width: 2.2rem; height: 2.2rem; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--kq-border); border-radius: 10px; background: var(--kq-bg); color: var(--kq-fg); cursor: pointer; }
.kq-icon-btn:hover { border-color: var(--kq-accent); }

.kq-settings-panel { margin-top: 0.85rem; padding: 0.85rem; border: 1px solid var(--kq-border); border-radius: var(--kq-radius); background: var(--kq-surface); }
.kq-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.3rem 0; }
.kq-settings-label { font-size: 0.9rem; font-weight: 600; }
.kq-settings-actions { display: flex; gap: 0.5rem; margin-top: 0.6rem; }

.kq-empty { text-align: center; color: var(--kq-muted); padding: 2rem 1rem; }
.kq-path { color: var(--kq-muted); font-size: 0.8rem; margin-top: 0.15rem; }
.kq-description { color: var(--kq-muted); font-size: 0.9rem; margin-top: 0.5rem; }

.kq-meta { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--kq-muted); }
.kq-timer { font-variant-numeric: tabular-nums; font-weight: 600; }
.kq-timer.kq-timer-low { color: var(--kq-incorrect); }

.kq-question { padding: 0.5rem 0 1rem; }
.kq-question + .kq-question { border-top: 1px solid var(--kq-border); }
.kq-prompt { font-size: 1.05rem; font-weight: 600; margin-bottom: 0.75rem; }
.kq-prompt code, .kq-fill-prompt code, .kq-row-label code { background: var(--kq-surface); padding: 0.05em 0.35em; border-radius: 6px; font-size: 0.9em; }

.kq-question-body { display: flex; flex-direction: column; gap: 0.5rem; }
.kq-option { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.7rem; border: 1px solid var(--kq-border); border-radius: 10px; cursor: pointer; transition: border-color .15s, background .15s; }
/* Persistent selected state — works on touch (hover does not). */
.kq-option:has(.kq-input:checked) { border-color: var(--kq-accent); background: color-mix(in srgb, var(--kq-accent) 12%, transparent); }
/* Hover only on devices that truly hover, so it never "sticks" after a tap. */
@media (hover: hover) { .kq-option:hover { border-color: var(--kq-accent); } }
.kq-input { width: 1.05rem; height: 1.05rem; accent-color: var(--kq-accent); flex: none; }

.kq-text { width: 100%; padding: 0.55rem 0.7rem; border: 1px solid var(--kq-border); border-radius: 10px; font: inherit; }
.kq-text-inline { width: auto; min-width: 6rem; padding: 0.3rem 0.5rem; }
/* Explicit color + custom caret so the chosen value shows reliably on mobile/dark,
   where a fully-native select can render its text invisibly. */
.kq-select {
  padding: 0.4rem 1.9rem 0.4rem 0.55rem; border: 1px solid var(--kq-border); border-radius: 10px;
  font: inherit; color: var(--kq-fg); background-color: var(--kq-bg);
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2012%2012'%3E%3Cpath%20d='M2%204l4%204%204-4'%20fill='none'%20stroke='%23888'%20stroke-width='1.5'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 0.55rem center; background-size: 0.7rem;
}
.kq-select option { color: var(--kq-fg); background: var(--kq-bg); }

/* fill_blank: prompt with inputs embedded inline */
.kq-fill-inline { font-size: 1.05rem; font-weight: 600; line-height: 2.3; margin: 0; }
.kq-fill-inline .kq-text-inline,
.kq-fill-inline .kq-select { font-weight: 400; margin: 0 0.2rem; vertical-align: baseline; }
.kq-fill-inline .kq-select { padding: 0.25rem 0.4rem; }
.kq-fill-controls { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.75rem; }
.kq-fill-field { display: inline-flex; align-items: center; gap: 0.4rem; }
.kq-blank-key { color: var(--kq-muted); font-weight: 600; }

.kq-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.5rem 0.7rem; border: 1px solid var(--kq-border); border-radius: 10px; }
.kq-row-label { flex: 1; }

.kq-ordering { list-style: decimal inside; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.kq-ordering-item { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0.7rem; border: 1px solid var(--kq-border); border-radius: 10px; }
.kq-move-group { display: inline-flex; gap: 0.25rem; }
.kq-move { border: 1px solid var(--kq-border); background: var(--kq-bg); border-radius: 8px; width: 2rem; height: 2rem; cursor: pointer; font-size: 0.8rem; }
.kq-move:disabled { opacity: 0.35; cursor: default; }

/* view toggle: switch a question type's presentation (e.g. classify dropdown ⇄ word bank) */
.kq-view-toggle { display: inline-flex; margin-bottom: 0.75rem; border: 1px solid var(--kq-border); border-radius: 10px; overflow: hidden; }
.kq-view-btn { font: inherit; font-size: 0.82rem; padding: 0.3rem 0.7rem; border: 0; background: var(--kq-bg); color: var(--kq-muted); cursor: pointer; }
.kq-view-btn + .kq-view-btn { border-left: 1px solid var(--kq-border); }
.kq-view-btn.kq-active { background: var(--kq-accent); color: var(--kq-accent-fg); }

/* classify "word bank" variant: chips in a pool up top, group drop-zones below */
.kq-buckets { display: flex; flex-direction: column; gap: 0.75rem; }
.kq-pool { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; min-height: 2.6rem; padding: 0.5rem; border: 1px dashed var(--kq-border); border-radius: 10px; }
.kq-groups { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.kq-group { flex: 1 1 8rem; min-width: 8rem; display: flex; flex-direction: column; gap: 0.35rem; }
.kq-group-label { font-weight: 600; font-size: 0.9rem; }
.kq-group-drop { display: flex; flex-wrap: wrap; gap: 0.4rem; align-content: flex-start; min-height: 3rem; padding: 0.5rem; border: 1px solid var(--kq-border); border-radius: 10px; }
.kq-pool.kq-droppable, .kq-group-drop.kq-droppable { border-color: var(--kq-accent); background: color-mix(in srgb, var(--kq-accent) 8%, transparent); }
.kq-pool:focus-visible, .kq-group-drop:focus-visible, .kq-chip:focus-visible { outline: 2px solid var(--kq-accent); outline-offset: 1px; }
.kq-chip { font: inherit; font-size: 0.9rem; padding: 0.35rem 0.6rem; border: 1px solid var(--kq-border); border-radius: 999px; background: var(--kq-surface); color: var(--kq-fg); cursor: pointer; }
.kq-chip.kq-selected { border-color: var(--kq-accent); background: var(--kq-accent); color: var(--kq-accent-fg); }
.kq-chip:disabled { cursor: default; opacity: 0.7; }
.kq-zone-empty { color: var(--kq-muted); }

/* correct / incorrect coloring revealed after "Check" (immediate feedback).
   Placed after the option/select rules so it wins on equal specificity. */
.kq-option.kq-correct, .kq-row.kq-correct, .kq-ordering-item.kq-correct { border-color: var(--kq-correct); background: color-mix(in srgb, var(--kq-correct) 14%, transparent); }
.kq-option.kq-incorrect, .kq-row.kq-incorrect, .kq-ordering-item.kq-incorrect { border-color: var(--kq-incorrect); background: color-mix(in srgb, var(--kq-incorrect) 14%, transparent); }
.kq-text.kq-correct, .kq-select.kq-correct { border-color: var(--kq-correct); background-color: color-mix(in srgb, var(--kq-correct) 14%, transparent); }
.kq-text.kq-incorrect, .kq-select.kq-incorrect { border-color: var(--kq-incorrect); background-color: color-mix(in srgb, var(--kq-incorrect) 14%, transparent); }
.kq-chip.kq-correct { border-color: var(--kq-correct); background: var(--kq-correct); color: #fff; }
.kq-chip.kq-incorrect { border-color: var(--kq-incorrect); background: var(--kq-incorrect); color: #fff; }

.kq-feedback { margin-top: 0.85rem; padding: 0.7rem 0.85rem; border-radius: 10px; border-left: 4px solid var(--kq-border); background: var(--kq-surface); font-size: 0.92rem; }
.kq-feedback.kq-is-correct { border-color: var(--kq-correct); }
.kq-feedback.kq-is-incorrect { border-color: var(--kq-incorrect); }
.kq-feedback.kq-is-partial { border-color: var(--kq-partial); }
.kq-feedback-title { font-weight: 700; }
.kq-feedback-line { margin-top: 0.25rem; }
.kq-feedback-line .kq-key { color: var(--kq-muted); }

.kq-footer { display: flex; align-items: center; gap: 0.6rem; margin-top: 1rem; padding-top: 0.85rem; border-top: 1px solid var(--kq-border); }
.kq-progress { color: var(--kq-muted); font-size: 0.85rem; margin-right: auto; }
.kq-btn { font: inherit; font-weight: 600; padding: 0.55rem 1rem; border-radius: 10px; border: 1px solid var(--kq-border); background: var(--kq-bg); color: var(--kq-fg); cursor: pointer; }
.kq-btn:hover { border-color: var(--kq-accent); }
.kq-btn:disabled { opacity: 0.5; cursor: default; }
.kq-btn-primary { background: var(--kq-accent); color: var(--kq-accent-fg); border-color: var(--kq-accent); }

.kq-results { text-align: center; }
.kq-score { font-size: 2.4rem; font-weight: 800; }
.kq-score-sub { color: var(--kq-muted); }
.kq-badge { display: inline-block; margin-top: 0.5rem; padding: 0.25rem 0.8rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; }
.kq-badge.kq-pass { background: color-mix(in srgb, var(--kq-correct) 15%, transparent); color: var(--kq-correct); }
.kq-badge.kq-fail { background: color-mix(in srgb, var(--kq-incorrect) 15%, transparent); color: var(--kq-incorrect); }

.kq-cat-table { width: 100%; border-collapse: collapse; margin-top: 1.25rem; text-align: left; font-size: 0.9rem; }
.kq-cat-table th, .kq-cat-table td { padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--kq-border); }
.kq-cat-table td:last-child, .kq-cat-table th:last-child { text-align: right; font-variant-numeric: tabular-nums; }

.kq-review { margin-top: 1.5rem; text-align: left; }
.kq-review-title { font-weight: 700; margin-bottom: 0.5rem; }
.kq-review-item { padding: 0.6rem 0; border-top: 1px solid var(--kq-border); }
.kq-review-head { display: flex; gap: 0.5rem; align-items: baseline; }
.kq-mark { font-weight: 800; flex: none; }
.kq-mark.kq-is-correct { color: var(--kq-correct); }
.kq-mark.kq-is-incorrect { color: var(--kq-incorrect); }
.kq-mark.kq-is-partial { color: var(--kq-partial); }
.kq-review-line { font-size: 0.9rem; margin-top: 0.2rem; }
.kq-review-line .kq-key { color: var(--kq-muted); }

/* fullscreen: fill the screen instead of the centered 720px card */
.kq-root:fullscreen { max-width: none; width: 100%; height: 100%; overflow-y: auto; border: 0; border-radius: 0; }
.kq-root.kq-fullscreen { max-width: none; }

/* ------------------------------------------------------------ library shell */
.kq-lib-root { max-width: 760px; }
.kq-lib-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }

/* AI prompt generator */
.kq-ai { margin-top: 0.75rem; padding: 0.85rem; border: 1px solid var(--kq-border); border-radius: var(--kq-radius); background: var(--kq-surface); display: flex; flex-direction: column; gap: 0.6rem; }
.kq-ai-context { font-size: 0.85rem; color: var(--kq-muted); margin: 0; }
.kq-ai-context a { color: var(--kq-accent); }
.kq-ai-field { display: flex; flex-direction: column; gap: 0.3rem; }
.kq-ai-label { font-size: 0.85rem; font-weight: 600; }
.kq-ai-hint { font-size: 0.78rem; color: var(--kq-muted); font-weight: 400; }
.kq-ai-out { min-height: 9rem; }
.kq-ai-actions { display: flex; gap: 0.5rem; align-items: center; }
.kq-lib-actions-wrap { margin-bottom: 1.25rem; }
.kq-lib-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.kq-file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
.kq-paste { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.6rem; }
.kq-textarea { width: 100%; min-height: 12rem; padding: 0.7rem 0.8rem; border: 1px solid var(--kq-border); border-radius: 10px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.85rem; background: var(--kq-bg); color: var(--kq-fg); resize: vertical; }
.kq-paste .kq-btn-primary { align-self: flex-start; }
.kq-error { margin-bottom: 1rem; padding: 0.7rem 0.85rem; border-radius: 10px; border-left: 4px solid var(--kq-incorrect); background: color-mix(in srgb, var(--kq-incorrect) 10%, transparent); font-size: 0.9rem; }

.kq-lib-list { display: flex; flex-direction: column; gap: 0.6rem; }
.kq-lib-empty { color: var(--kq-muted); text-align: center; padding: 1.5rem 1rem; border: 1px dashed var(--kq-border); border-radius: var(--kq-radius); }
.kq-lib-item { border: 1px solid var(--kq-border); border-radius: var(--kq-radius); padding: 0.75rem 0.85rem; }
.kq-lib-item-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.kq-lib-info { min-width: 0; }
.kq-lib-title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kq-lib-sub { color: var(--kq-muted); font-size: 0.82rem; margin-top: 0.1rem; }
.kq-lib-item-actions { display: flex; align-items: center; gap: 0.4rem; flex: none; }
.kq-lib-bar { margin-bottom: 1rem; }

/* Theme: OS preference by default; an explicit .kq-theme-* class (set by the
   toggle) wins and cascades into any nested .kq-root (player inside the library). */
@media (prefers-color-scheme: dark) {
  .kq-root {
    --kq-bg: #16161f; --kq-fg: #e5e7eb; --kq-muted: #9ca3af;
    --kq-border: #2c2c3a; --kq-surface: #1f1f2b; --kq-accent: #818cf8;
  }
}
.kq-root.kq-theme-dark, .kq-theme-dark .kq-root {
  --kq-bg: #16161f; --kq-fg: #e5e7eb; --kq-muted: #9ca3af;
  --kq-border: #2c2c3a; --kq-surface: #1f1f2b; --kq-accent: #818cf8;
}
.kq-root.kq-theme-light, .kq-theme-light .kq-root {
  --kq-bg: #ffffff; --kq-fg: #1a1a2e; --kq-muted: #6b7280;
  --kq-border: #e5e7eb; --kq-surface: #f9fafb; --kq-accent: #4f46e5;
}
`;
