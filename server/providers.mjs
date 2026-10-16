// The AI tools Cache Warmup can use for interview feedback.
//
// Tools that run on a subscription you already pay for come first; pay-per-token
// APIs are the last resort. Each provider has:
//   id, label, usage   what the UI shows
//   hint               how to set it up when it's missing
//   models             a few suggestions for the model picker (free text is fine too)
//   available()        whether it can run on this machine
//   run(prompt, model) returns the model's reply as text

import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TIMEOUT_MS = 180_000;
const OLLAMA = () => (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");

export const PROVIDERS = [
  {
    id: "claude",
    label: "Claude Code",
    usage: "your Claude plan (Pro or Max), via Claude Code",
    hint: "Install Claude Code, then run `claude` once to log in.",
    models: ["sonnet", "opus", "haiku"],
    available: () => onPath("claude"),
    // -p prints one answer and exits. --tools "" turns off every tool (no file
    // access, no shell), so this is a plain question-and-answer call.
    run: (prompt, model) =>
      runCli(
        "claude",
        [
          "-p",
          "--tools",
          "",
          "--strict-mcp-config",
          "--no-session-persistence",
          "--output-format",
          "text",
          ...(model ? ["--model", model] : []),
        ],
        prompt,
      ),
  },
  {
    id: "codex",
    label: "Codex CLI",
    usage: "your ChatGPT plan, via Codex CLI",
    hint: "Install Codex CLI, then run `codex` once to log in.",
    models: [],
    available: () => onPath("codex"),
    run: (prompt, model) =>
      runCli("codex", [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        ...(model ? ["--model", model] : []),
        prompt,
      ]),
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    usage: "your Google account, via Gemini CLI",
    hint: "Install Gemini CLI, then run `gemini` once to log in.",
    models: [],
    available: () => onPath("gemini"),
    run: (prompt, model) => runCli("gemini", [...(model ? ["--model", model] : []), "--prompt", prompt]),
  },
  {
    id: "opencode",
    label: "OpenCode",
    usage: "the provider and model you set up in OpenCode",
    hint: "Install OpenCode, then run `opencode auth login`.",
    models: [],
    available: () => onPath("opencode"),
    run: (prompt, model) =>
      runCli("opencode", ["run", "--pure", ...(model ? ["--model", model] : []), prompt]),
  },
  {
    id: "ollama",
    label: "Ollama",
    usage: "a model running on your own machine (free)",
    hint: "Start Ollama and pull a model, for example `ollama pull llama3.1`.",
    models: [],
    available: async () => (await ollamaModels()).length > 0,
    run: ollamaRun,
  },
  {
    id: "anthropic",
    label: "Anthropic API",
    usage: "API credits from ANTHROPIC_API_KEY",
    hint: "Set the ANTHROPIC_API_KEY environment variable.",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    available: () => Boolean(process.env.ANTHROPIC_API_KEY),
    run: anthropicRun,
  },
  {
    id: "openai",
    label: "OpenAI-compatible API",
    usage: "API credits from OPENAI_API_KEY",
    hint: "Set OPENAI_API_KEY (and OPENAI_BASE_URL for non-OpenAI servers), then pick a model.",
    models: [],
    needsModel: true,
    available: () => Boolean(process.env.OPENAI_API_KEY),
    run: openaiRun,
  },
];

export const providerById = (id) => PROVIDERS.find((p) => p.id === id);

/** Model suggestions; for Ollama these are the models you've pulled. */
export async function modelSuggestions(provider) {
  if (provider.id === "ollama") return ollamaModels();
  return provider.models;
}

/* ------------------------------------------------------------------------- */

function onPath(bin) {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    try {
      accessSync(path.join(dir, bin), constants.X_OK);
      return true;
    } catch {
      /* keep looking */
    }
  }
  return false;
}

export function coded(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Runs a CLI in an empty temporary folder, so it never sees your project files.
// Arguments go straight to the program (no shell), so answer text can't be
// interpreted as a command.
function runCli(bin, args, stdinText) {
  return new Promise((resolve, reject) => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cache-warmup-"));
    const child = spawn(bin, args, {
      cwd,
      env: process.env,
      stdio: [stdinText ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const cleanup = () => rmSync(cwd, { recursive: true, force: true });
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      cleanup();
      reject(coded("provider_error", `couldn't start ${bin}: ${e.message}`));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      cleanup();
      if (signal) return reject(coded("timeout", `${bin} took longer than ${TIMEOUT_MS / 1000}s`));
      if (code !== 0)
        return reject(
          coded("provider_error", lastLine(err) || lastLine(out) || `${bin} exited with code ${code}`),
        );
      resolve(out);
    });
    if (stdinText) {
      child.stdin.on("error", () => {});
      child.stdin.end(stdinText);
    }
  });
}

function lastLine(s) {
  return (
    String(s || "")
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-1)[0] || ""
  );
}

async function fetchJson(url, init = {}, ms = TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw coded("provider_error", data?.error?.message || data?.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw coded("timeout", "the request timed out");
    throw e.code ? e : coded("provider_error", e.message);
  } finally {
    clearTimeout(timer);
  }
}

async function ollamaModels() {
  try {
    const data = await fetchJson(`${OLLAMA()}/api/tags`, {}, 800);
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

async function ollamaRun(prompt, model) {
  const chosen = model || (await ollamaModels())[0];
  const data = await fetchJson(`${OLLAMA()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: chosen,
      stream: false,
      format: "json",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  return data.message?.content || "";
}

async function anthropicRun(prompt, model) {
  const chosen = model || "claude-opus-5-5";
  // Server-side fallbacks retry a declined request on a suitable model.
  // Only the newest models support it, so it's off when you pick another one.
  const fallbacks = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"].includes(
    chosen,
  );
  const data = await fetchJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      ...(fallbacks ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
    },
    body: JSON.stringify({
      model: chosen,
      max_tokens: 16000,
      ...(fallbacks ? { fallbacks: "default" } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (data.stop_reason === "refusal") throw coded("refused", "the model declined to grade this answer");
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function openaiRun(prompt, model) {
  if (!model) throw coded("provider_error", "pick a model for the OpenAI-compatible API in Settings");
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const data = await fetchJson(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  return data.choices?.[0]?.message?.content || "";
}
