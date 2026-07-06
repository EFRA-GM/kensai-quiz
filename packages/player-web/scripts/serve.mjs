// Tiny dependency-free static server for local development.
// Serves the package folder so examples/cdn.html can load ../dist/*.global.js.
// Usage: node scripts/serve.mjs [port]   (default 4321)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, ".."); // packages/player-web
const port = Number(process.argv[2]) || 4321;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
};

const server = createServer(async (req, res) => {
  let pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (pathname === "/") pathname = "/examples/cdn.html"; // convenience: open the demo

  // Prevent path traversal outside the package folder.
  const filePath = normalize(join(rootDir, pathname));
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found: " + pathname);
  }
});

server.listen(port, () => {
  console.log(`\n  Kensai Quiz demo → http://localhost:${port}/examples/cdn.html\n`);
});
