#!/usr/bin/env node
// Cache Warmup server: serves the built app (dist/) and the AI feedback API.
//
//   npm start                            build, then run this and open the browser
//   node server/index.mjs --list         which AI tools are available here
//   node server/index.mjs --provider X   force a tool (locks the Settings picker)
//
// Run with --help for every option.

import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "./bridge.mjs";
import { PROVIDERS } from "./providers.mjs";
import { CONFIG_FILE, readPreference } from "./config.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
Cache Warmup server

Usage: npm start                        (builds the app, then starts this)
       node server/index.mjs [options]

Options:
  --provider <id>   auto, off, ${PROVIDERS.map((p) => p.id).join(", ")}
                    Overrides the choice saved in Settings until you restart.
  --model <name>    Model to ask for (optional; each tool has a default)
  --port <number>   Port to listen on (default 4317)
  --open            Open the app in your browser once the server starts
  --list            Show which AI tools are available, then exit
  --help            Show this help

Environment variables:
  CW_PROVIDER, CW_MODEL, PORT     same as the flags
  CW_ALLOWED_ORIGINS              other sites allowed to use the AI endpoints,
                                  comma-separated (e.g. https://you.github.io)
  ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENAI_BASE_URL, OLLAMA_HOST
`);
  process.exit(0);
}

if (args.list) {
  console.log("\n  AI tools on this machine (auto picks the first available one):\n");
  for (const p of PROVIDERS) {
    const ok = await p.available();
    console.log(
      `  ${ok ? "✓" : "·"} ${p.id.padEnd(10)} ${p.label.padEnd(22)} ${ok ? "uses " + p.usage : p.hint}`,
    );
  }
  const saved = readPreference();
  console.log(`\n  Saved choice: ${saved.provider}${saved.model ? ` (${saved.model})` : ""}\n`);
  process.exit(0);
}

if (!existsSync(path.join(DIST, "index.html"))) {
  console.error("\n  The app hasn't been built yet. Run `npm start` (or `npm run build` first).\n");
  process.exit(1);
}

const PORT = Number(args.port || process.env.PORT || 4317);
const flagProvider = args.provider || process.env.CW_PROVIDER;
const flagModel = args.model || process.env.CW_MODEL;
const override = flagProvider
  ? { provider: String(flagProvider).toLowerCase(), model: String(flagModel || "") }
  : null;
if (
  override &&
  !["auto", "off"].includes(override.provider) &&
  !PROVIDERS.some((p) => p.id === override.provider)
) {
  console.error(
    `  Unknown provider "${override.provider}". Options: auto, off, ${PROVIDERS.map((p) => p.id).join(", ")}`,
  );
  process.exit(1);
}
const extraOrigins = String(process.env.CW_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const bridge = await createBridge({ override, extraOrigins });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end();
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(DIST, rel));
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!file.startsWith(DIST + path.sep) || !type) {
    res.writeHead(404);
    return res.end("Not found");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) return await bridge.handle(req, res);
    const host = String(req.headers.host || "");
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    return await serveStatic(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE")
    console.error(`\n  Port ${PORT} is busy. Try: npm start -- --port ${PORT + 1}\n`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  const link = `http://localhost:${PORT}`;
  const { active, preference, locked } = bridge.describe();
  console.log(`\n  Cache Warmup is running at ${link}\n`);
  if (active) {
    console.log(
      `  AI feedback: on, using ${active.label}${preference.model ? ` (${preference.model})` : ""}`,
    );
    console.log(`               spends ${active.usage}`);
  } else if (preference.provider === "off") {
    console.log("  AI feedback: off (you chose that)");
  } else if (preference.provider !== "auto") {
    console.log(`  AI feedback: off. "${preference.provider}" isn't available on this machine.`);
  } else {
    console.log("  AI feedback: off. No AI tool found. Run `npm run providers` to see the options.");
  }
  console.log(
    locked
      ? "               (set by --provider; the Settings picker is locked until you restart without it)"
      : `               (change it in Settings; saved to ${path.basename(CONFIG_FILE)})`,
  );
  if (extraOrigins.length) console.log(`  Also accepting AI requests from: ${extraOrigins.join(", ")}`);
  console.log("\n  Press Ctrl+C to stop.\n");
  if (args.open) openBrowser(link);
});

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) out[k] = v;
    else if (list[i + 1] && !list[i + 1].startsWith("--")) out[k] = list[++i];
    else out[k] = true;
  }
  return out;
}

function openBrowser(link) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try {
    spawn(cmd, [link], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore */
  }
}
