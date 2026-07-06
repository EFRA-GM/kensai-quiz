/** Normalize free-text for comparison: trim, collapse whitespace, optional lowercase. */
export function normalizeText(value: string, caseSensitive = false): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

/** True if `given` matches any accepted answer under the same normalization. */
export function textMatches(
  given: string,
  accept: readonly string[],
  caseSensitive = false,
): boolean {
  const normalized = normalizeText(given, caseSensitive);
  return accept.some((a) => normalizeText(a, caseSensitive) === normalized);
}
