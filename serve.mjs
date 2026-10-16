#!/usr/bin/env node
// Cache Warmup local server.
//
// Serves the app and, when it finds an AI tool you already use, powers the
// "Get interviewer feedback" button. Zero dependencies: Node 18+ is all you need.
//
//   node serve.mjs                      # auto-detect an AI tool
//   node serve.mjs --provider opencode  # pick one explicitly
//   node serve.mjs --provider off       # lessons only, no AI
//   node serve.mjs --list               # show what it can find on this machine
//
// Run `node serve.mjs --help` for every option.

import http from "node:http";
import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
Cache Warmup local server

Usage: node serve.mjs [options]        (or: npm start)

Options:
  --provider <id>   auto (default), off, claude, codex, gemini, opencode,
                    ollama, anthropic, openai
  --model <name>    Model to ask for (optional; each tool has a sensible default)
  --port <number>   Port to listen on (default 4317)
  --open            Open the app in your browser once the server starts
  --list            Show which AI providers are available, then exit
  --help            Show this help

Environment variables (same as the flags, for scripts):
  CW_PROVIDER, CW_MODEL, PORT, CW_ALLOWED_ORIGINS (comma-separated extra
  origins allowed to call the AI endpoints, e.g. https://you.github.io)
  ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENAI_BASE_URL, OLLAMA_HOST
`);
  process.exit(0);
}

const PORT = Number(args.port || process.env.PORT || 4317);
const HOST = "127.0.0.1";
const WANT = String(args.provider || process.env.CW_PROVIDER || "auto").toLowerCase();
const MODEL = String(args.model || process.env.CW_MODEL || "");
const EXTRA_ORIGINS = String(process.env.CW_ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
const OLLAMA = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");
const TIMEOUT_MS = 180_000;
const MAX_PROMPT = 40_000;

/* ------------------------------------------------------------------------- */
/* Providers. Tools that run on a subscription you already pay for come      */
/* first; pay-per-token APIs are the last resort.                            */
/* ------------------------------------------------------------------------- */

const PROVIDERS = [
  {
    id: "claude",
    label: "Claude Code",
    usage: "your Claude plan (Pro or Max), via Claude Code",
    available: () => onPath("claude"),
    // -p prints one answer and exits. --tools "" turns off every tool (no file
    // access, no shell), so this is a plain question-and-answer call.
    run: prompt => runCli("claude", [
      "-p", "--tools", "", "--strict-mcp-config", "--no-session-persistence",
      "--output-format", "text", ...(MODEL ? ["--model", MODEL] : [])
    ], prompt)
  },
  {
    id: "codex",
    label: "Codex CLI",
    usage: "your ChatGPT plan, via Codex CLI",
    available: () => onPath("codex"),
    run: prompt => runCli("codex", [
      "exec", "--skip-git-repo-check", "--sandbox", "read-only",
      ...(MODEL ? ["--model", MODEL] : []), prompt
    ])
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    usage: "your Google account, via Gemini CLI",
    available: () => onPath("gemini"),
    run: prompt => runCli("gemini", [...(MODEL ? ["--model", MODEL] : []), "--prompt", prompt])
  },
  {
    id: "opencode",
    label: "OpenCode",
    usage: "the provider and model you set up in OpenCode",
    available: () => onPath("opencode"),
    run: prompt => runCli("opencode", ["run", "--pure", ...(MODEL ? ["--model", MODEL] : []), prompt])
  },
  {
    id: "ollama",
    label: "Ollama",
    usage: "a model running on your own machine (free)",
    available: async () => Boolean(await ollamaModel()),
    run: ollamaRun
  },
  {
    id: "anthropic",
    label: "Anthropic API",
    usage: "API credits from ANTHROPIC_API_KEY",
    available: () => Boolean(process.env.ANTHROPIC_API_KEY),
    run: anthropicRun
  },
  {
    id: "openai",
    label: "OpenAI-compatible API",
    usage: "API credits from OPENAI_API_KEY",
    available: () => Boolean(process.env.OPENAI_API_KEY && MODEL),
    run: openaiRun
  }
];

async function pickProvider() {
  if (WANT === "off" || WANT === "none") return null;
  if (WANT !== "auto") {
    const p = PROVIDERS.find(x => x.id === WANT);
    if (!p) {
      console.error(`  Unknown provider "${WANT}". Options: auto, off, ${PROVIDERS.map(x => x.id).join(", ")}`);
      process.exit(1);
    }
    if (!(await p.available())) {
      console.warn(`  ! ${p.label} doesn't look available here (${hintFor(p.id)}). AI feedback stays off.`);
      return null;
    }
    return p;
  }
  for (const p of PROVIDERS) if (await p.available()) return p;
  return null;
}

function hintFor(id) {
  return {
    claude: "install Claude Code and run `claude` once to log in",
    codex: "install Codex CLI and run `codex` once to log in",
    gemini: "install Gemini CLI and run `gemini` once to log in",
    opencode: "install OpenCode and run `opencode auth login`",
    ollama: "start Ollama and pull a model, e.g. `ollama pull llama3.1`",
    anthropic: "set ANTHROPIC_API_KEY",
    openai: "set OPENAI_API_KEY and CW_MODEL (plus OPENAI_BASE_URL for non-OpenAI servers)"
  }[id] || "";
}

/* ------------------------------------------------------------------------- */
/* Provider plumbing                                                         */
/* ------------------------------------------------------------------------- */

function onPath(bin) {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    try { accessSync(path.join(dir, bin), constants.X_OK); return true; } catch { /* keep looking */ }
  }
  return false;
}

function coded(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Runs a CLI in an empty temporary folder, so it never sees your project files.
// Arguments go straight to the program (no shell), so answer text can't be
// interpreted as a command.
function runCli(bin, cliArgs, stdinText) {
  return new Promise((resolve, reject) => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cache-warmup-"));
    const child = spawn(bin, cliArgs, { cwd, env: process.env, stdio: [stdinText ? "pipe" : "ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const cleanup = () => { try { rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ } };
    const timer = setTimeout(() => { child.kill("SIGTERM"); }, TIMEOUT_MS);
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    child.on("error", e => { clearTimeout(timer); cleanup(); reject(coded("provider_error", `couldn't start ${bin}: ${e.message}`)); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      cleanup();
      if (signal) return reject(coded("timeout", `${bin} took longer than ${TIMEOUT_MS / 1000}s`));
      if (code !== 0) return reject(coded("provider_error", lastLine(err) || lastLine(out) || `${bin} exited with code ${code}`));
      resolve(out);
    });
    if (stdinText) { child.stdin.on("error", () => {}); child.stdin.end(stdinText); }
  });
}

function lastLine(s) {
  return String(s || "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim().split("\n").filter(Boolean).slice(-1)[0] || "";
}

async function fetchJson(url, init = {}, ms = TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw coded("provider_error", (data.error && (data.error.message || data.error)) || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw coded("timeout", "the request timed out");
    throw e.code ? e : coded("provider_error", e.message);
  } finally {
    clearTimeout(timer);
  }
}

async function ollamaModel() {
  if (MODEL) return MODEL;
  try {
    const data = await fetchJson(`${OLLAMA}/api/tags`, {}, 800);
    return (data.models && data.models[0] && data.models[0].name) || null;
  } catch {
    return null;
  }
}

async function ollamaRun(prompt) {
  const model = await ollamaModel();
  const data = await fetchJson(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, format: "json", messages: [{ role: "user", content: prompt }] })
  });
  return (data.message && data.message.content) || "";
}

async function anthropicRun(prompt) {
  const model = MODEL || "claude-opus-5-5";
  // Server-side fallbacks retry a declined request on a suitable model.
  // Supported on the newest models only, so it's off when you pick another one.
  const fallbacks = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"].includes(model);
  const data = await fetchJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      ...(fallbacks ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {})
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      ...(fallbacks ? { fallbacks: "default" } : {}),
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (data.stop_reason === "refusal") throw coded("refused", "the model declined to grade this answer");
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

async function openaiRun(prompt) {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const data = await fetchJson(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }] })
  });
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

/* ------------------------------------------------------------------------- */
/* HTTP server                                                               */
/* ------------------------------------------------------------------------- */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8"
};
const SELF_ORIGINS = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
const OK_HOSTS = [`localhost:${PORT}`, `127.0.0.1:${PORT}`];

let provider = null;
let busy = false;

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(coded("too_large", "request too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const origin = req.headers.origin;
  const allowed = !origin || SELF_ORIGINS.includes(origin) || EXTRA_ORIGINS.includes(origin);
  if (origin && EXTRA_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.method === "OPTIONS") return send(res, allowed ? 204 : 403, "");
  // Only this app may use the AI endpoints. Other websites open in your
  // browser can't reach them and spend your usage.
  if (!allowed) return sendJson(res, 403, { error: { code: "forbidden_origin", message: `Origin ${origin} isn't allowed. Add it to CW_ALLOWED_ORIGINS.` } });

  if (url.pathname === "/api/ai/status" && req.method === "GET") {
    return sendJson(res, 200, provider
      ? { enabled: true, provider: provider.id, label: provider.label, usage: provider.usage }
      : { enabled: false });
  }

  if (url.pathname === "/api/ai/feedback" && req.method === "POST") {
    if (!provider) return sendJson(res, 503, { error: { code: "no_provider", message: "No AI tool is configured." } });
    if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
      return sendJson(res, 415, { error: { code: "bad_request", message: "Send JSON." } });
    }
    if (busy) return sendJson(res, 429, { error: { code: "busy", message: "Another answer is being graded." } });
    let prompt;
    try {
      const body = JSON.parse(await readBody(req, MAX_PROMPT * 2));
      prompt = String(body.prompt || "");
    } catch {
      return sendJson(res, 400, { error: { code: "bad_request", message: "Couldn't read the request." } });
    }
    if (!prompt.trim() || prompt.length > MAX_PROMPT) {
      return sendJson(res, 400, { error: { code: "bad_request", message: "The prompt is empty or too long." } });
    }
    busy = true;
    const started = Date.now();
    try {
      const text = await provider.run(prompt);
      console.log(`  ✓ feedback from ${provider.label} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return sendJson(res, 200, { text, provider: provider.id });
    } catch (e) {
      console.warn(`  ✗ ${provider.label}: ${e.message}`);
      return sendJson(res, 502, { error: { code: e.code || "provider_error", message: e.message } });
    } finally {
      busy = false;
    }
  }

  return sendJson(res, 404, { error: { code: "not_found", message: "Unknown endpoint." } });
}

async function handleStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, "Bad path"); }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(ROOT, rel));
  const inside = file.startsWith(ROOT + path.sep);
  const hidden = path.relative(ROOT, file).split(path.sep).some(part => part.startsWith(".") || part === "node_modules");
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!inside || hidden || !type) return send(res, 404, "Not found");
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    send(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    // Refuse requests that don't name this server directly (DNS-rebinding protection).
    if (!OK_HOSTS.includes(String(req.headers.host || ""))) return send(res, 403, "Forbidden");
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await handleStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, "Something went wrong");
  }
});

/* ------------------------------------------------------------------------- */
/* Start                                                                     */
/* ------------------------------------------------------------------------- */

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
  try { spawn(cmd, [link], { stdio: "ignore", detached: true }).unref(); } catch { /* ignore */ }
}

if (args.list) {
  console.log("\n  AI providers on this machine (checked in this order):\n");
  for (const p of PROVIDERS) {
    const ok = await p.available();
    console.log(`  ${ok ? "✓" : "·"} ${p.id.padEnd(10)} ${p.label.padEnd(22)} ${ok ? "uses " + p.usage : hintFor(p.id)}`);
  }
  console.log("");
  process.exit(0);
}

provider = await pickProvider();

server.on("error", e => {
  if (e.code === "EADDRINUSE") console.error(`\n  Port ${PORT} is busy. Try: npm start -- --port ${PORT + 1}\n`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\n  Cache Warmup is running at ${link}\n`);
  if (provider) {
    console.log(`  AI feedback: on, using ${provider.label}`);
    console.log(`               (spends ${provider.usage})`);
  } else if (WANT === "off" || WANT === "none") {
    console.log("  AI feedback: off (you asked for that)");
  } else {
    console.log("  AI feedback: off. No AI tool found.");
    console.log("               Run `node serve.mjs --list` to see the options.");
  }
  if (EXTRA_ORIGINS.length) console.log(`  Also accepting AI requests from: ${EXTRA_ORIGINS.join(", ")}`);
  console.log("\n  Press Ctrl+C to stop.\n");
  if (args.open) openBrowser(link);
});
