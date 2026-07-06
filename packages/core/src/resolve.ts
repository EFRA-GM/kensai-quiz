import type { ChoiceQuestion, ClassifyQuestion, Group, Option, Quiz } from "./types.js";

/** Resolve a choice question's options, whether inline or from an option_group. */
export function resolveChoiceOptions(quiz: Quiz, question: ChoiceQuestion): Option[] {
  if (question.options) return question.options;
  if (question.options_from) return quiz.option_groups?.[question.options_from] ?? [];
  return [];
}

/**
 * Resolve a classify question's buckets. Inline `groups` are used as-is; a
 * `groups_from` option group is adapted (its `text` becomes the bucket `label`).
 */
export function resolveGroups(quiz: Quiz, question: ClassifyQuestion): Group[] {
  if (question.groups) return question.groups;
  if (question.groups_from) {
    const group = quiz.option_groups?.[question.groups_from] ?? [];
    return group.map((option) => ({ id: option.id, label: option.text }));
  }
  return [];
}
