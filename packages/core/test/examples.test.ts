import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadQuiz, validateQuiz } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "..", "..", "spec", "examples");
const files = readdirSync(examplesDir).filter((f) => f.endsWith(".yaml"));

describe("spec examples", () => {
  it("has example files to validate", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`validates ${file} (no errors, no warnings)`, () => {
      const source = readFileSync(join(examplesDir, file), "utf8");
      const result = validateQuiz(loadQuiz(source, { validate: false }));
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it(`loadQuiz accepts ${file}`, () => {
      const source = readFileSync(join(examplesDir, file), "utf8");
      expect(() => loadQuiz(source)).not.toThrow();
    });
  }
});
