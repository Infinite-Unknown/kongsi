#!/usr/bin/env node
// Minimal static server for local development. No dependencies.
//
//   node scripts/serve.mjs [--port 8471] [--host 127.0.0.1]
//
// It sends the headers the open agentic web spec asks for on a static host:
// CORS on the public agent files (so other agent sites and tools can read them),
// a locked-down Content-Security-Policy on the coded-tool sandbox worker, and nothing
// that blocks framing of bridge/ (other agent sites load bridge/action-bridge.html).
// The same rules are in _headers for Netlify / Cloudflare Pages.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(opt("port", process.env.PORT || 8471));
const HOST = opt("host", "127.0.0.1");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".hocon": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const PUBLIC_AGENT_FILES = new Set([
  "/agent-manifest.json",
  "/kongsi_bill_splitter.network.json",
  "/kongsi_bill_splitter.hocon",
  "/links.json",
  "/agent-mcp.json",
  "/.well-known/nsdeploy.json",
  "/.well-known/nsdeploy-agent.json",
]);

// Never serve these: development-only or private files.
const BLOCKED = [/^\/\.git(\/|$)/, /^\/\.env/, /^\/node_modules\//, /^\/tests\//, /^\/scripts\//];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    if (BLOCKED.some((re) => re.test(pathname))) {
      res.writeHead(404).end("Not found");
      return;
    }
    const file = path.join(ROOT, path.normalize(pathname));
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    const headers = {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    };
    if (PUBLIC_AGENT_FILES.has(pathname)) {
      headers["Access-Control-Allow-Origin"] = "*";
    }
    if (pathname === "/runtime/sandbox-worker.js") {
      headers["Content-Security-Policy"] = "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'";
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
    console.log(`${new Date().toISOString()} ${req.method} ${pathname} 200${req.headers.origin ? ` origin=${req.headers.origin}` : ""}`);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Server error");
    console.error(error);
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST.includes(":") ? `[${HOST}]` : HOST;
  console.log(`Kongsi on http://${shown}:${PORT}/`);
  console.log(`Network URL: http://${shown}:${PORT}/kongsi_bill_splitter`);
});
