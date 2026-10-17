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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "./bridge.mjs";
import { PROVIDERS } from "./providers.mjs";
import { CONFIG_FILE, readPreference } from "./config.mjs";
import { PROVIDER_CHOICES, bridgeOptions } from "./options.mjs";
import { createStaticHandler } from "./static.mjs";

/** @typedef {import("./options.mjs").BridgeOptions} BridgeOptions */
/** @typedef {Awaited<ReturnType<typeof createBridge>>} Bridge */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const DEFAULT_PORT = "4317";

/**
 * How each OS opens a link in the default browser (Linux and others: xdg-open).
 * @type {Partial<Record<NodeJS.Platform, string>>}
 */
const OPEN_COMMANDS = { darwin: "open", win32: "explorer" };

const HELP = `
Cache Warmup server

Usage: npm start                        (builds the app, then starts this)
       node server/index.mjs [options]

Options:
  --provider <id>   ${PROVIDER_CHOICES.join(", ")}
                    Overrides the choice saved in Settings until you restart.
  --model <name>    Model to ask for. Needs --provider too (each tool has a default).
  --port <number>   Port to listen on (default ${DEFAULT_PORT})
  --open            Open the app in your browser once the server starts
  --list            Show which AI tools are available, then exit
  --help            Show this help

Which AI tool is used: --provider/--model, then CW_PROVIDER/CW_MODEL, then the choice
saved in cache-warmup.config.json (Settings), then the first tool found.

Environment variables (npm run dev reads them too):
  CW_PROVIDER, CW_MODEL     same as --provider and --model
  CW_ALLOWED_ORIGINS        other sites allowed to use the AI endpoints, comma-separated
                            (e.g. https://you.github.io, which trusts every Pages site under it)
  CW_CONFIG_FILE            where the Settings choice is saved (default: cache-warmup.config.json)
  PORT                      same as --port (npm start only; npm run dev uses Vite's port)
  OLLAMA_HOST               where Ollama listens (default 127.0.0.1:11434)
  ANTHROPIC_API_KEY         turns on the Anthropic API tool (never passed to Claude Code)
  OPENAI_API_KEY            turns on the OpenAI-compatible API tool
  OPENAI_BASE_URL           for OpenAI-compatible servers other than OpenAI
`;

await main(parseArgs(process.argv.slice(2)));

/** @param {Record<string, string | true>} args */
async function main(args) {
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.list) {
    await printProviders();
    process.exit(0);
  }

  const port = parsePort(args.port ?? process.env.PORT ?? DEFAULT_PORT);
  const options = readOptions(args);

  if (!existsSync(path.join(DIST, "index.html"))) {
    exitWithError("The app hasn't been built yet. Run `npm start` (or `npm run build` first).");
  }

  const bridge = await createBridge(options);
  startServer(port, bridge, options, Boolean(args.open));
}

/**
 * @param {number} port
 * @param {Bridge} bridge
 * @param {BridgeOptions} options
 * @param {boolean} open open the browser once it's listening
 */
function startServer(port, bridge, options, open) {
  const serveStatic = createStaticHandler(DIST);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url?.startsWith("/api/")) return await bridge.handle(req, res);
      return await serveStatic(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  server.on("error", (/** @type {NodeJS.ErrnoException} */ e) => {
    if (e.code === "EADDRINUSE") exitWithError(`Port ${port} is busy. Try: npm start -- --port ${port + 1}`);
    console.error(e);
    process.exit(1);
  });

  // Ctrl+C: exit normally, so any AI tool still running is stopped too (see run-cli.mjs).
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));

  server.listen(port, "127.0.0.1", async () => {
    const link = `http://localhost:${port}`;
    console.log(`\n  Cache Warmup is running at ${link}\n`);
    printAIStatus(await bridge.describe(), options);
    console.log("\n  Press Ctrl+C to stop.\n");
    if (open) openBrowser(link);
  });
}

/** `--list`: every provider, and whether it can run here. */
async function printProviders() {
  console.log("\n  AI tools on this machine (auto picks the first available one):\n");

  for (const p of PROVIDERS) {
    const ok = await p.available();
    const note = ok ? "uses " + p.usage + (p.needsModel ? " (needs a model; auto skips it)" : "") : p.hint;
    console.log(`  ${ok ? "✓" : "·"} ${p.id.padEnd(10)} ${p.label.padEnd(22)} ${note}`);
  }

  const saved = readPreference();
  console.log(`\n  Saved choice: ${saved.provider}${saved.model ? ` (${saved.model})` : ""}\n`);
}

/**
 * The startup lines about AI feedback: which tool answers, or why none does.
 * @param {Awaited<ReturnType<Bridge["describe"]>>} description
 * @param {BridgeOptions} options
 */
function printAIStatus({ active, preference, locked }, options) {
  console.log(`  AI feedback: ${aiFeedbackState(active, preference)}`);
  console.log(
    locked
      ? "               (set by --provider or CW_PROVIDER; the Settings picker is locked until you restart without it)"
      : `               (change it in Settings; saved to ${path.basename(CONFIG_FILE)})`,
  );

  if (options.extraOrigins.length) {
    console.log(`  Also accepting AI requests from: ${options.extraOrigins.join(", ")}`);
  }
}

/**
 * "on, using Claude Code", or why it's off.
 * @param {import("./providers.mjs").Provider | null} active
 * @param {import("./options.mjs").Preference} preference
 */
function aiFeedbackState(active, preference) {
  if (active) {
    const model = preference.provider === active.id ? preference.model : "";
    return `on, using ${active.label}${model ? ` (${model})` : ""}\n               spends ${active.usage}`;
  }

  if (preference.provider === "off") return "off (you chose that)";
  if (preference.provider !== "auto") return `off. "${preference.provider}" isn't available on this machine.`;
  return "off. No AI tool found. Run `npm run providers` to see the options.";
}

/**
 * @param {Record<string, string | true>} args
 * @returns {BridgeOptions}
 */
function readOptions(args) {
  try {
    return bridgeOptions({ provider: args.provider, model: args.model });
  } catch (e) {
    return exitWithError(e instanceof Error ? e.message : String(e));
  }
}

/** @param {unknown} value */
function parsePort(value) {
  const port = Number(value);

  if (!/^\d+$/.test(String(value)) || port < 1 || port > 65535) {
    exitWithError(`"${value}" isn't a port number. Use one from 1 to 65535, like: npm start -- --port 4400`);
  }

  return port;
}

/** @param {string[]} list */
function parseArgs(list) {
  /** @type {Record<string, string | true>} */
  const out = {};

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.startsWith("--")) continue;

    const eq = a.indexOf("=");

    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (list[i + 1] && !list[i + 1].startsWith("--")) out[a.slice(2)] = list[++i];
    else out[a.slice(2)] = true;
  }

  return out;
}

/** @param {string} link */
function openBrowser(link) {
  const cmd = OPEN_COMMANDS[process.platform] ?? "xdg-open";

  try {
    spawn(cmd, [link], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}
