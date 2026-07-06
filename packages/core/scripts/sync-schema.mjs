// Regenerates src/schema.generated.ts from the authoritative JSON Schema.
//
// The spec (spec/quiz.schema.json) is the single source of truth for validation.
// We inline it as a typed TS constant so the core bundles cleanly for both Node
// and the browser without a runtime JSON read. Run via `pnpm sync:schema`; it
// also runs automatically before build / test / typecheck.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const schemaPath = join(repoRoot, "spec", "quiz.schema.json");
const outDir = join(here, "..", "src");
const outPath = join(outDir, "schema.generated.ts");

const raw = readFileSync(schemaPath, "utf8");
const json = JSON.parse(raw); // fails loudly if the schema is not valid JSON

const banner =
  "// AUTO-GENERATED FILE — do not edit by hand.\n" +
  "// Source: spec/quiz.schema.json  (run `pnpm sync:schema` to regenerate).\n\n";
const body =
  `export const quizSchema = ${JSON.stringify(json, null, 2)} as const;\n\n` +
  "export default quizSchema;\n";

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, banner + body, "utf8");
console.log(`sync-schema: wrote ${outPath}`);
