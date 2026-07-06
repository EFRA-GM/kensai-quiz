/**
 * Minimal, safe inline-Markdown renderer for quiz text.
 *
 * Supports a deliberate subset — `**bold**`, `*italic*`/`_italic_`, `` `code` ``,
 * `[text](url)`, and line breaks — which is all prompts/options/labels need. Input
 * is HTML-escaped first, so the output is safe to assign to `innerHTML`.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderInlineMarkdown(input: string): string {
  let out = escapeHtml(input);
  // `code`
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, text) => `<strong>${text}</strong>`);
  // *italic* (avoid touching the leftovers of bold)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, pre, text) => `${pre}<em>${text}</em>`);
  // _italic_
  out = out.replace(/(^|[^\w])_([^_\n]+)_/g, (_m, pre, text) => `${pre}<em>${text}</em>`);
  // [text](url) — only http(s), root-relative, or anchor links
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    const safe = /^(https?:\/\/|\/|#)/.test(url) ? url : "#";
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  // newlines
  out = out.replace(/\n/g, "<br>");
  return out;
}
