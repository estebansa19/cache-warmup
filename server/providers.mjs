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
//
// How each one runs lives elsewhere: run-cli.mjs for the CLIs, apis.mjs for Ollama and the APIs.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { anthropicRun, ollamaModels, ollamaRun, openaiRun } from "./apis.mjs";
import { onPath, runCli } from "./run-cli.mjs";

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

export function providerById(/** @type {string} */ id) {
  return PROVIDERS.find((p) => p.id === id);
}

/** Model suggestions; for Ollama these are the models you've pulled. */
export async function modelSuggestions(/** @type {Provider} */ provider) {
  if (provider.id === "ollama") return ollamaModels();
  return provider.models;
}

// "--model=x" in one argument, so a model name can never be read as a separate flag.
function modelFlag(/** @type {string} */ model) {
  return model ? [`--model=${model}`] : [];
}
