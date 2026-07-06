import { renderInlineMarkdown } from "./markdown";

type Child = Node | string | null | undefined | false;
// deno-lint-ignore no-explicit-any
type Attrs = Record<string, any>;

/** Terse element builder. Special attrs: `class`, `text`, `html`, and `on*` listeners. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = String(value);
      else if (key === "text") node.textContent = String(value);
      else if (key === "html") node.innerHTML = String(value);
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Element whose content is rendered from inline Markdown (escaped, then formatted). */
export function mdEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  markdown: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  return el(tag, { class: className, html: renderInlineMarkdown(markdown) });
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Resolve a target that may be an element, a CSS selector, or a bare element id. */
export function resolveTarget(target: string | HTMLElement): HTMLElement {
  if (typeof target !== "string") return target;
  let node: Element | null = null;
  try {
    node = document.querySelector(target);
  } catch {
    node = null;
  }
  if (!node && /^[A-Za-z][\w-]*$/.test(target)) node = document.getElementById(target);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Kensai Quiz: target "${target}" was not found in the document.`);
  }
  return node;
}
