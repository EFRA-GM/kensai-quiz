import type { ResolvedSettings } from "@kensai/quiz-core";
import { el } from "./dom";

/**
 * The subset of settings a player may expose to the learner via the ⚙️ gear.
 * `"shuffle"` is a convenience control that toggles question order and answer-option
 * shuffling together; the rest map 1:1 to `ResolvedSettings` fields.
 */
export type EditableSettingKey =
  | "navigation"
  | "order"
  | "feedback"
  | "shuffle_options"
  | "shuffle"
  | "time_limit";

const LABELS: Record<EditableSettingKey, string> = {
  navigation: "Navigation",
  order: "Question order",
  feedback: "Feedback",
  shuffle_options: "Shuffle answer options",
  shuffle: "Shuffle questions & options",
  time_limit: "Time limit (minutes)",
};

export interface SettingsPanelOptions {
  /** Which settings to expose, in display order. */
  keys: EditableSettingKey[];
  /** Current values used to seed the controls. */
  current: Partial<ResolvedSettings>;
  /** Called with only the changed fields when the learner applies. */
  onApply: (patch: Partial<ResolvedSettings>) => void;
  /** Optional close/cancel handler; a "Close" button is added when present. */
  onClose?: () => void;
}

/**
 * Build a small settings form for the whitelisted keys. Framework-free; the caller
 * decides what applying the patch means (restart an attempt, persist a default…).
 */
export function buildSettingsPanel(opts: SettingsPanelOptions): HTMLElement {
  const { keys, current } = opts;
  const panel = el("div", { class: "kq-settings-panel" });
  const controls = new Map<EditableSettingKey, HTMLInputElement | HTMLSelectElement>();

  for (const key of keys) {
    let field: HTMLInputElement | HTMLSelectElement;
    switch (key) {
      case "navigation":
        field = selectField(
          [["all", "All on one page"], ["sequential", "One at a time"]],
          String(current.navigation ?? "all"),
        );
        break;
      case "order":
        field = selectField([["fixed", "Fixed"], ["random", "Shuffled"]], String(current.order ?? "fixed"));
        break;
      case "feedback":
        field = selectField(
          [["on_finish", "On finish"], ["immediate", "Immediate"]],
          String(current.feedback ?? "on_finish"),
        );
        break;
      case "shuffle_options": {
        const cb = el("input", { type: "checkbox", class: "kq-input" }) as HTMLInputElement;
        cb.checked = current.shuffle_options === true;
        field = cb;
        break;
      }
      case "shuffle": {
        // One toggle for both question order and answer-option shuffling.
        const cb = el("input", { type: "checkbox", class: "kq-input" }) as HTMLInputElement;
        cb.checked = current.order === "random" || current.shuffle_options === true;
        field = cb;
        break;
      }
      case "time_limit": {
        // Displayed in minutes; stored (in core) as seconds.
        const num = el("input", {
          type: "number",
          min: "0",
          step: "0.5",
          class: "kq-text kq-text-inline",
          placeholder: "unlimited",
        }) as HTMLInputElement;
        if (current.time_limit != null) num.value = String(current.time_limit / 60);
        field = num;
        break;
      }
    }
    controls.set(key, field);
    panel.append(
      el("label", { class: "kq-settings-row" }, el("span", { class: "kq-settings-label", text: LABELS[key] }), field),
    );
  }

  const actions = el("div", { class: "kq-settings-actions" });
  actions.append(
    el("button", { type: "button", class: "kq-btn kq-btn-primary", onclick: () => opts.onApply(readPatch(controls)) }, "Apply"),
  );
  if (opts.onClose) {
    actions.append(el("button", { type: "button", class: "kq-btn", onclick: () => opts.onClose!() }, "Close"));
  }
  panel.append(actions);
  return panel;
}

function readPatch(
  controls: Map<EditableSettingKey, HTMLInputElement | HTMLSelectElement>,
): Partial<ResolvedSettings> {
  const patch: Partial<ResolvedSettings> = {};
  for (const [key, field] of controls) {
    if (key === "shuffle_options") {
      patch.shuffle_options = (field as HTMLInputElement).checked;
    } else if (key === "shuffle") {
      // Unified toggle → drive both question order and option shuffling.
      const on = (field as HTMLInputElement).checked;
      patch.order = on ? "random" : "fixed";
      patch.shuffle_options = on;
    } else if (key === "time_limit") {
      // Minutes in the UI → seconds in core (0 or blank = unlimited).
      const raw = (field as HTMLInputElement).value.trim();
      patch.time_limit = raw === "" ? null : Math.max(0, Math.round(Number(raw) * 60)) || null;
    } else if (key === "navigation") {
      patch.navigation = field.value as ResolvedSettings["navigation"];
    } else if (key === "order") {
      patch.order = field.value as ResolvedSettings["order"];
    } else if (key === "feedback") {
      patch.feedback = field.value as ResolvedSettings["feedback"];
    }
  }
  return patch;
}

function selectField(options: [string, string][], value: string): HTMLSelectElement {
  const select = el("select", { class: "kq-select" }) as HTMLSelectElement;
  for (const [v, label] of options) select.append(el("option", { value: v, text: label }));
  select.value = value;
  return select;
}
