/**
 * Browser-native "save this to a file" helpers — no dependency.
 *
 * A download is just a `Blob` exposed through an object URL and clicked via a
 * throwaway `<a download>`. Everything here is guarded so it is a harmless no-op
 * in a non-DOM environment (SSR / tests without a document).
 */
import { el } from "./dom";

/** Trigger a browser download of `data` as `filename`. No-op without a DOM. */
export function downloadBlob(filename: string, data: string | Uint8Array, mime: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    return;
  }
  // Cast for the DOM lib's stricter `BlobPart` (typed-array generic) expectation.
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = el("a", { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Release the object URL on the next tick so the click has been handled.
  if (typeof setTimeout === "function") {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } else {
    URL.revokeObjectURL(url);
  }
}

/**
 * Turn a quiz title into a safe, lowercase file-name stem: keep ASCII letters,
 * digits, dot, underscore and hyphen; collapse everything else into single
 * hyphens; trim leading/trailing hyphens. Falls back to `"quiz"` when nothing
 * usable remains (e.g. a title that is all emoji or punctuation).
 */
export function slugFilename(title: string, fallback = "quiz"): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug || fallback;
}
