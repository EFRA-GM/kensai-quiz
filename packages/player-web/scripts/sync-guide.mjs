// Regenerates src/ai-guide.generated.ts from the authoritative AI authoring guide.
//
// spec/AI_AUTHORING_GUIDE.md is the paste-into-a-chat prompt that teaches an LLM the
// quiz format. The library's "Create with AI" tool embeds it verbatim so the prompt
// works with any model — including the many that cannot browse a URL. We inline it as
// a TS string constant so the browser bundle carries it with no runtime fetch. Run via
// `pnpm sync:guide`; it also runs automatically before build / test / typecheck.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const guidePath = join(repoRoot, "spec", "AI_AUTHORING_GUIDE.md");
const outDir = join(here, "..", "src");
const outPath = join(outDir, "ai-guide.generated.ts");

const guide = readFileSync(guidePath, "utf8");

const banner =
  "// AUTO-GENERATED FILE — do not edit by hand.\n" +
  "// Source: spec/AI_AUTHORING_GUIDE.md  (run `pnpm sync:guide` to regenerate).\n\n";
const body =
  "/** The full AI authoring guide, inlined so the prompt works without a URL fetch. */\n" +
  `export const aiAuthoringGuide = ${JSON.stringify(guide)};\n\n` +
  "export default aiAuthoringGuide;\n";

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, banner + body, "utf8");
console.log(`sync-guide: wrote ${outPath}`);
