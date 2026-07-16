import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { library, QuizLibrary } from "../src/index";
import { crc32, zipSync } from "../src/zip";
import { slugFilename } from "../src/download";

const STORAGE_KEY = "kensai-quiz-library";
const FOLDERS_KEY = "kensai-quiz-library:folders";
const ATTEMPTS_KEY = "kensai-quiz-library:attempts";

/** A minimal, parseable quiz source (validation is disabled in these UI tests). */
const quizYaml = (title: string): string =>
  [
    'schema_version: "0.1"',
    "metadata:",
    `  title: ${title}`,
    "questions:",
    "  - id: q1",
    "    type: true_false",
    '    prompt: "1 is odd."',
    "    answer: true",
    "",
  ].join("\n");

let host: HTMLElement;

const mount = (): QuizLibrary => library(host, { validate: false });

const readStored = (): any[] => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");

const clickText = (text: string): void => {
  const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!btn) throw new Error(`button "${text}" not found`);
  (btn as HTMLButtonElement).click();
};

const click = (selector: string): void => {
  const btn = host.querySelector<HTMLElement>(selector);
  if (!btn) throw new Error(`element "${selector}" not found`);
  btn.click();
};

// jsdom's Blob lacks .text()/.arrayBuffer(); read it through a FileReader instead.
const blobText = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

const blobBytes = (b: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.id = "app";
  document.body.append(host);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ folders */

describe("folders", () => {
  it("saves quizzes into the folder currently being viewed; loose quizzes stay at root", () => {
    const lib = mount();
    // Create a folder.
    clickText("📁 New folder");
    const name = host.querySelector<HTMLInputElement>(".kq-paste .kq-text")!;
    name.value = "Grammar";
    clickText("Create folder");

    const folderId = JSON.parse(localStorage.getItem(FOLDERS_KEY)!)[0].id as string;

    // A quiz added at root is loose.
    lib.addQuiz(quizYaml("Loose"));
    // Open the folder, then a quiz added there gets the folderId.
    click(".kq-folder-open");
    lib.addQuiz(quizYaml("InFolder"));

    const stored = readStored();
    const loose = stored.find((q) => q.title === "Loose");
    const inFolder = stored.find((q) => q.title === "InFolder");
    expect(loose.folderId ?? null).toBeNull();
    expect(inFolder.folderId).toBe(folderId);
  });

  it("moves a quiz into a folder and back to root via the Move select", () => {
    const lib = mount();
    clickText("📁 New folder");
    host.querySelector<HTMLInputElement>(".kq-paste .kq-text")!.value = "F";
    clickText("Create folder");
    const folderId = JSON.parse(localStorage.getItem(FOLDERS_KEY)!)[0].id as string;

    lib.addQuiz(quizYaml("Movable"));

    const select = host.querySelector<HTMLSelectElement>(".kq-lib-move")!;
    select.value = folderId;
    select.dispatchEvent(new Event("change"));
    expect(readStored()[0].folderId).toBe(folderId);

    // The quiz left the root view for the folder; open the folder to move it back.
    click(".kq-folder-open");
    const back = host.querySelector<HTMLSelectElement>(".kq-lib-move")!;
    back.value = "";
    back.dispatchEvent(new Event("change"));
    expect(readStored()[0].folderId).toBeNull();
  });

  it("deleting a folder re-homes its quizzes to the root", () => {
    vi.stubGlobal("confirm", () => true);
    const lib = mount();
    clickText("📁 New folder");
    host.querySelector<HTMLInputElement>(".kq-paste .kq-text")!.value = "Temp";
    clickText("Create folder");
    click(".kq-folder-open");
    lib.addQuiz(quizYaml("Kept"));
    // Back to root to see the folder row.
    click(".kq-crumb-link");

    click('.kq-icon-btn[aria-label="Delete folder"]');

    expect(JSON.parse(localStorage.getItem(FOLDERS_KEY)!)).toHaveLength(0);
    const stored = readStored();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("Kept");
    expect(stored[0].folderId).toBeNull();
  });
});

/* ------------------------------------------------------- default settings */

describe("default quiz settings", () => {
  it("shuffles questions and options by default for newly added quizzes", () => {
    const lib = mount();
    lib.addQuiz(quizYaml("Fresh"));
    const stored = readStored()[0];
    expect(stored.settings.order).toBe("random");
    expect(stored.settings.shuffle_options).toBe(true);
  });

  it("lets a developer override the defaults via defaultSettings", () => {
    const lib = library(host, { validate: false, defaultSettings: { order: "fixed" } });
    lib.addQuiz(quizYaml("Fresh"));
    const stored = readStored()[0];
    expect(stored.settings.order).toBe("fixed");
    expect(stored.settings.shuffle_options).toBeUndefined();
  });
});

/* ------------------------------------------------------- backward compat */

describe("backward compatibility", () => {
  it("renders a pre-seeded flat array that has no folderId", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "old1", title: "Legacy Quiz", count: 3, source: quizYaml("Legacy Quiz"), format: "yaml", savedAt: 1 },
      ]),
    );
    mount();
    const titles = [...host.querySelectorAll(".kq-lib-title")].map((n) => n.textContent);
    expect(titles).toContain("Legacy Quiz");
  });
});

/* -------------------------------------------------------- multi-file upload */

describe("multi-file upload", () => {
  const dispatchFiles = (files: File[]): void => {
    const input = host.querySelector<HTMLInputElement>(".kq-file")!;
    Object.defineProperty(input, "files", { value: files, configurable: true });
    input.dispatchEvent(new Event("change"));
  };

  it("adds several quizzes from one upload, first file on top", async () => {
    mount();
    dispatchFiles([
      new File([quizYaml("Alpha")], "alpha.yaml"),
      new File([quizYaml("Beta")], "beta.yaml"),
    ]);
    await vi.waitFor(() => expect(readStored()).toHaveLength(2));
    const stored = readStored();
    expect(stored[0].title).toBe("Alpha");
    expect(stored[1].title).toBe("Beta");
  });

  it("surfaces a partial failure without dropping the good file", async () => {
    mount();
    dispatchFiles([
      new File([quizYaml("Good")], "good.yaml"),
      new File(["not a quiz"], "bad.yaml"),
    ]);
    await vi.waitFor(() => expect(readStored()).toHaveLength(1));
    expect(readStored()[0].title).toBe("Good");
    const err = host.querySelector(".kq-error");
    expect(err?.textContent).toMatch(/1 added, 1 failed/);
  });
});

/* ----------------------------------------------------------------- zip.ts */

describe("zip writer", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("emits a valid archive with local-header and EOCD signatures", () => {
    const enc = new TextEncoder();
    const zip = zipSync([{ name: "a.yaml", data: enc.encode("hello") }]);
    // Local file header magic "PK\x03\x04".
    expect([zip[0], zip[1], zip[2], zip[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // End-of-central-directory magic "PK\x05\x06" appears near the end.
    const view = new DataView(zip.buffer);
    const eocd = view.getUint32(zip.length - 22, true);
    expect(eocd).toBe(0x06054b50);
  });
});

/* ------------------------------------------------------------- downloads */

describe("downloads", () => {
  const stubDownload = () => {
    const blobs: Blob[] = [];
    const clicks: { download: string }[] = [];
    (URL as any).createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:mock";
    });
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ download: this.download });
    });
    return { blobs, clicks };
  };

  it("downloads a single quiz as its own file", async () => {
    const { blobs, clicks } = stubDownload();
    const lib = mount();
    lib.addQuiz(quizYaml("My Quiz"));
    click('.kq-icon-btn[aria-label="Download quiz"]');
    expect(clicks[0]!.download).toBe("my-quiz.yaml");
    expect(blobs[0]!.type).toBe("text/yaml");
    expect(await blobText(blobs[0]!)).toContain("title: My Quiz");
  });

  it("downloads a folder as a single .zip", async () => {
    vi.stubGlobal("confirm", () => true);
    const { blobs, clicks } = stubDownload();
    const lib = mount();
    clickText("📁 New folder");
    host.querySelector<HTMLInputElement>(".kq-paste .kq-text")!.value = "Bundle";
    clickText("Create folder");
    click(".kq-folder-open");
    lib.addQuiz(quizYaml("Inside"));
    click(".kq-crumb-link"); // back to root to reach the folder row

    click('.kq-icon-btn[aria-label="Download folder as zip"]');
    expect(clicks[0]!.download).toBe("bundle.zip");
    expect(blobs[0]!.type).toBe("application/zip");
    const bytes = await blobBytes(blobs[0]!);
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

/* --------------------------------------------------------- results panel */

describe("results", () => {
  const seedQuiz = (id: string, title: string) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id, title, count: 4, source: quizYaml(title), format: "yaml", savedAt: 1 }]),
    );
  };
  const seedAttempts = (id: string, attempts: unknown[]) => {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ [id]: attempts }));
  };
  const cat = (categoryId: string | null, correct: number, total: number, label?: string) => ({
    categoryId,
    label,
    correct,
    total,
    accuracy: total ? correct / total : 0,
  });

  it("renders quiz action buttons on their own row", () => {
    const lib = mount();
    lib.addQuiz(quizYaml("Layout"));
    const row = host.querySelector(".kq-lib-actions-row");
    expect(row).not.toBeNull();
    expect(row!.querySelector('.kq-icon-btn[aria-label="View results"]')).not.toBeNull();
  });

  it("shows summary, weakest topic and a per-topic table from stored attempts", () => {
    seedQuiz("quizA", "Verbs");
    seedAttempts("quizA", [
      { at: 1, ratio: 0.5, score: 2, maxScore: 4, passed: null, byCategory: [cat("g", 1, 2, "Grammar"), cat("v", 1, 2, "Vocab")] },
      { at: 2, ratio: 1.0, score: 4, maxScore: 4, passed: null, byCategory: [cat("g", 1, 2, "Grammar"), cat("v", 2, 2, "Vocab")] },
    ]);
    mount();
    // Sub-line reflects history.
    expect(host.querySelector(".kq-lib-sub")!.textContent).toMatch(/avg 75% · 2 attempts/);

    click('.kq-icon-btn[aria-label="View results"]');
    const panel = host.querySelector(".kq-results-panel")!;
    expect(panel.querySelector(".kq-results-summary")!.textContent).toMatch(/2 attempts/);
    expect(panel.querySelector(".kq-results-summary")!.textContent).toMatch(/best 100%/);
    // Grammar is weakest overall (2/4 vs Vocab 3/4).
    expect(panel.querySelector(".kq-focus")!.textContent).toMatch(/Focus on:\s*Grammar/);

    // Expand the most recent execution to see its per-topic table.
    const rows = panel.querySelectorAll<HTMLButtonElement>(".kq-attempt-row");
    expect(rows.length).toBe(2);
    rows[0]!.click();
    expect(host.querySelector(".kq-attempt-detail")).not.toBeNull();
  });

  it("shows an empty note when there is no history", () => {
    const lib = mount();
    lib.addQuiz(quizYaml("Fresh"));
    click('.kq-icon-btn[aria-label="View results"]');
    expect(host.querySelector(".kq-results-empty")).not.toBeNull();
  });

  it("clears a quiz's history when the quiz is deleted", () => {
    vi.stubGlobal("confirm", () => true);
    seedQuiz("quizA", "Doomed");
    seedAttempts("quizA", [{ at: 1, ratio: 0.5, score: 2, maxScore: 4, passed: null, byCategory: [] }]);
    mount();
    click('.kq-icon-btn[aria-label="Delete"]');
    const attempts = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? "{}");
    expect(attempts.quizA).toBeUndefined();
  });
});

/* --------------------------------------------------------------- helpers */

describe("slugFilename", () => {
  it("slugifies titles and falls back when empty", () => {
    expect(slugFilename("Present Perfect vs Past!")).toBe("present-perfect-vs-past");
    expect(slugFilename("🎯🎯")).toBe("quiz");
    expect(slugFilename("🎯", "folder")).toBe("folder");
  });
});
