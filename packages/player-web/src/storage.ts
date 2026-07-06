/**
 * A tiny JSON key-value store backed by `localStorage`, with an in-memory
 * fallback for environments where it is unavailable or blocked (SSR, private
 * mode, disabled storage). Nothing here leaves the user's own browser.
 */

interface KVBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();

const memoryBackend: KVBackend = {
  getItem: (key) => (memory.has(key) ? memory.get(key)! : null),
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
};

function backend(): KVBackend {
  try {
    if (typeof localStorage !== "undefined") {
      const probe = "__kq_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    /* fall through to the in-memory backend */
  }
  return memoryBackend;
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = backend().getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    backend().setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / availability errors — persistence is best-effort */
  }
}
