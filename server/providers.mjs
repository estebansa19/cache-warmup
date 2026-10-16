// The AI tools Cache Warmup can use for interview feedback.
//
// Tools that run on a subscription you already pay for come first; pay-per-token
// APIs are the last resort. Each provider has:
//   id, label, usage   what the UI shows
//   hint               how to set it up when it's missing
//   models             a few suggestions for the model picker (free text is fine too)
//   needsModel         true when it can't run without a model name (never picked by "auto")
//   available()        whether it can run on this machine
//   run(prompt, model, signal)  returns the model's reply as text; stops when `signal` aborts

import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TIMEOUT_MS = 180_000;
const KILL_GRACE_MS = 3_000;
const MAX_REPLY = 1_000_000;
const STDERR_TAIL = 4_000;

/** @typedef {(prompt: string, model: string, signal?: AbortSignal) => Promise<string>} Run */
/**
 * @typedef {object} Provider
 * @property {string} id
 * @property {string} label
 * @property {string} usage
 * @property {string} hint
 * @property {string[]} models
 * @property {boolean} [needsModel]
 * @property {() => boolean | Promise<boolean>} available
 * @property {Run} run
 */

// "--model=x" in one argument, so a model name can never be read as a separate flag.
const modelFlag = (/** @type {string} */ model) => (model ? [`--model=${model}`] : []);

// OpenCode: deny every permission, so the model has no tools at all (checked with `opencode debug agent`).
const OPENCODE_NO_TOOLS = JSON.stringify({
  permission: Object.fromEntries(
    [
      "*",
      ...["read", "edit", "glob", "grep", "list", "bash", "task", "skill", "lsp", "question", "webfetch"],
      ...["websearch", "codesearch", "external_directory", "doom_loop", "todowrite", "todoread"],
    ].map((key) => [key, "deny"]),
  ),
});

// Gemini CLI: a policy that denies every tool. Denied tools are removed from what the model can call.
const GEMINI_NO_TOOLS = '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n';

/** @type {Provider[]} */
export const PROVIDERS = [
  {
    id: "claude",
    label: "Claude Code",
    usage: "your Claude plan (Pro or Max), via Claude Code",
    hint: "Install Claude Code, then run `claude` once to log in.",
    models: ["sonnet", "opus", "haiku"],
    available: () => onPath("claude"),
    // -p prints one answer and exits. --tools "" turns off every built-in tool, --strict-mcp-config
    // skips your MCP servers, and --disable-slash-commands skips skills. The prompt goes in on stdin.
    // Without ANTHROPIC_API_KEY, Claude Code uses your login (your plan), not API credits.
    run: (prompt, model, signal) =>
      runCli(
        "claude",
        [
          "-p",
          "--tools",
          "",
          "--strict-mcp-config",
          "--disable-slash-commands",
          "--no-session-persistence",
          "--output-format",
          "text",
          ...modelFlag(model),
        ],
        { input: prompt, signal, dropEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] },
      ),
  },
  {
    id: "codex",
    label: "Codex CLI",
    usage: "your ChatGPT plan, via Codex CLI",
    hint: "Install Codex CLI, then run `codex` once to log in.",
    models: [],
    available: () => onPath("codex"),
    // Codex has no switch for "no tools". This turns off the shell and web search and keeps the
    // sandbox read-only; it can still read files, but it starts in an empty folder. With no prompt
    // argument, `codex exec` reads the prompt from stdin. CODEX_API_KEY would replace your ChatGPT login.
    run: (prompt, model, signal) =>
      runCli(
        "codex",
        [
          "exec",
          "--skip-git-repo-check",
          "--ephemeral",
          "--sandbox",
          "read-only",
          "-c",
          "features.shell_tool=false",
          "-c",
          "features.view_image=false",
          "-c",
          'web_search="disabled"',
          ...modelFlag(model),
        ],
        { input: prompt, signal, dropEnv: ["CODEX_API_KEY"] },
      ),
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    usage: "your Google account, via Gemini CLI",
    hint: "Install Gemini CLI, then run `gemini` once to log in.",
    models: [],
    available: () => onPath("gemini"),
    // Piped input runs Gemini CLI headless. The --policy file denies every tool.
    run: (prompt, model, signal) =>
      runCli(
        "gemini",
        (dir) => {
          const policy = path.join(dir, "no-tools.toml");
          writeFileSync(policy, GEMINI_NO_TOOLS);
          return [...modelFlag(model), "--policy", policy];
        },
        { input: prompt, signal },
      ),
  },
  {
    id: "opencode",
    label: "OpenCode",
    usage: "the provider and model you set up in OpenCode",
    hint: "Install OpenCode, then run `opencode auth login`.",
    models: [],
    available: () => onPath("opencode"),
    // --pure skips plugins; OPENCODE_CONFIG_CONTENT denies every tool. `opencode run` reads stdin.
    run: (prompt, model, signal) =>
      runCli("opencode", ["run", "--pure", ...modelFlag(model)], {
        input: prompt,
        signal,
        env: { OPENCODE_CONFIG_CONTENT: OPENCODE_NO_TOOLS },
      }),
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

export const providerById = (/** @type {string} */ id) => PROVIDERS.find((p) => p.id === id);

/** Model suggestions; for Ollama these are the models you've pulled. */
export async function modelSuggestions(/** @type {Provider} */ provider) {
  if (provider.id === "ollama") return ollamaModels();
  return provider.models;
}

/* ------------------------------------------------------------------------- */

function onPath(/** @type {string} */ bin) {
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

/** An error with a code the bridge turns into an HTTP status. */
export class CodedError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const coded = (/** @type {string} */ code, /** @type {string} */ message) =>
  new CodedError(code, message);

/** CLIs still running, so they can be stopped if the server exits first. */
const running = new Set();
process.on("exit", () => {
  for (const child of running) killGroup(child, "SIGKILL");
});

/** Stops a CLI and anything it started (it runs in its own process group). */
function killGroup(
  /** @type {import("node:child_process").ChildProcess} */ child,
  /** @type {NodeJS.Signals} */ signal,
) {
  try {
    process.kill(-(child.pid ?? 0), signal);
  } catch {
    child.kill(signal);
  }
}

/**
 * Runs a CLI in an empty temporary folder, so it never sees your project files.
 * Arguments go straight to the program (no shell), and the prompt goes in on stdin.
 * Stops it on timeout or when `signal` aborts: SIGTERM first, SIGKILL if it doesn't exit.
 *
 * @param {string} bin
 * @param {string[] | ((dir: string) => string[])} args a function gets the temporary folder
 * @param {{input: string, signal?: AbortSignal, env?: Record<string, string>, dropEnv?: string[]}} options
 * @returns {Promise<string>}
 */
function runCli(bin, args, { input, signal, env = {}, dropEnv = [] }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(coded("cancelled", "the request was cancelled"));
    const cwd = mkdtempSync(path.join(tmpdir(), "cache-warmup-"));
    // PWD too: some CLIs (OpenCode) take the project folder from it rather than the real cwd.
    /** @type {NodeJS.ProcessEnv} */
    const childEnv = { ...process.env, ...env, PWD: cwd };
    for (const name of dropEnv) delete childEnv[name];
    const child = spawn(bin, typeof args === "function" ? args(cwd) : args, {
      cwd,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    running.add(child);

    let out = "";
    let err = "";
    /** @type {"timeout" | "cancelled" | "too_long" | null} */
    let stopped = null;
    /** @type {NodeJS.Timeout | undefined} */
    let killTimer;
    const stop = (/** @type {"timeout" | "cancelled" | "too_long"} */ why) => {
      if (stopped) return;
      stopped = why;
      killGroup(child, "SIGTERM");
      killTimer = setTimeout(() => killGroup(child, "SIGKILL"), KILL_GRACE_MS);
    };
    const timer = setTimeout(() => stop("timeout"), TIMEOUT_MS);
    const onAbort = () => stop("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      running.delete(child);
      rmSync(cwd, { recursive: true, force: true });
    };

    // Decode as UTF-8 streams, so a character split across chunks stays intact.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (/** @type {string} */ d) => {
      out += d;
      if (out.length > MAX_REPLY) stop("too_long");
    });
    child.stderr.on("data", (/** @type {string} */ d) => (err = (err + d).slice(-STDERR_TAIL)));
    child.on("error", (e) => {
      cleanup();
      reject(coded("provider_error", `couldn't start ${bin}: ${e.message}`));
    });
    child.on("close", (code, sig) => {
      cleanup();
      if (stopped === "timeout")
        return reject(coded("timeout", `${bin} took longer than ${TIMEOUT_MS / 1000}s`));
      if (stopped === "cancelled") return reject(coded("cancelled", "the request was cancelled"));
      if (stopped === "too_long") return reject(coded("provider_error", `${bin} sent back too much text`));
      if (code !== 0) {
        const fallback = sig ? `${bin} was stopped (${sig})` : `${bin} exited with code ${code}`;
        return reject(coded("provider_error", lastLine(err) || lastLine(out) || fallback));
      }
      resolve(out);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function lastLine(/** @type {string} */ s) {
  return (
    String(s || "")
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-1)[0] || ""
  );
}

/**
 * fetch() that gives up after `ms`, or when `signal` aborts.
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ms?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<any>}
 */
async function fetchJson(url, init, { ms = TIMEOUT_MS, signal } = {}) {
  const timeout = AbortSignal.timeout(ms);
  try {
    const res = await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw coded("provider_error", data?.error?.message || data?.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (signal?.aborted) throw coded("cancelled", "the request was cancelled");
    if (timeout.aborted) throw coded("timeout", "the request timed out");
    throw e instanceof CodedError ? e : coded("provider_error", e instanceof Error ? e.message : String(e));
  }
}

/**
 * The Ollama server address. OLLAMA_HOST may be a full URL or Ollama's short forms like
 * "0.0.0.0" or "host:port": no scheme means http and port 11434, and 0.0.0.0 / [::] (listen
 * on every interface) means this machine.
 */
export function ollamaBase(value = process.env.OLLAMA_HOST) {
  const raw = String(value ?? "").trim();
  const fallback = "http://127.0.0.1:11434";
  if (!raw) return fallback;
  const hasScheme = raw.includes("://");
  const hostPort = hasScheme ? raw : raw.startsWith(":") ? `127.0.0.1${raw}` : raw;
  try {
    const url = new URL(hasScheme ? hostPort : `http://${hostPort}`);
    if (!hasScheme && !/^(\[[^\]]*\]|[^/:]*):\d+/.test(hostPort)) url.port = "11434";
    if (url.hostname === "0.0.0.0" || url.hostname === "[::]") url.hostname = "127.0.0.1";
    return (url.origin + url.pathname).replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

/** @returns {Promise<string[]>} */
async function ollamaModels() {
  try {
    const data = await fetchJson(`${ollamaBase()}/api/tags`, {}, { ms: 800 });
    return (data.models || []).map((/** @type {{name: string}} */ m) => m.name);
  } catch {
    return [];
  }
}

/** @type {Run} */
async function ollamaRun(prompt, model, signal) {
  const chosen = model || (await ollamaModels())[0];
  const data = await fetchJson(
    `${ollamaBase()}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chosen,
        stream: false,
        format: "json",
        messages: [{ role: "user", content: prompt }],
      }),
    },
    { signal },
  );
  return data.message?.content || "";
}

/** @type {Run} */
async function anthropicRun(prompt, model, signal) {
  const chosen = model || "claude-opus-5-5";
  // Server-side fallbacks retry a declined request on a suitable model.
  // Only the newest models support it, so it's off when you pick another one.
  const fallbacks = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"].includes(
    chosen,
  );
  const data = await fetchJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        ...(fallbacks ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      },
      body: JSON.stringify({
        model: chosen,
        max_tokens: 16000,
        ...(fallbacks ? { fallbacks: "default" } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    },
    { signal },
  );
  if (data.stop_reason === "refusal") throw coded("refused", "the model declined to grade this answer");
  return (data.content || [])
    .filter((/** @type {{type: string}} */ b) => b.type === "text")
    .map((/** @type {{text: string}} */ b) => b.text)
    .join("");
}

/** @type {Run} */
async function openaiRun(prompt, model, signal) {
  if (!model) throw coded("provider_error", "pick a model for the OpenAI-compatible API in Settings");
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const data = await fetchJson(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    },
    { signal },
  );
  return data.choices?.[0]?.message?.content || "";
}
