import { defineConfig } from "tsup";

export default defineConfig([
  // npm builds: keep the core external so consumers dedupe it.
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    external: ["@kensai/quiz-core"],
  },
  // CDN build: a single self-contained IIFE exposing `window.KensaiQuiz`.
  // Everything (core + ajv + js-yaml) is bundled in; styles inject themselves.
  {
    entry: { "kensai-quiz-player": "src/index.ts" },
    format: ["iife"],
    globalName: "KensaiQuiz",
    platform: "browser",
    minify: true,
    sourcemap: true,
    treeshake: true,
    noExternal: [/.*/],
    outExtension: () => ({ js: ".global.js" }),
  },
]);
