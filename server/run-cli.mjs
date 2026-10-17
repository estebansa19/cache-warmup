// Runs an AI command-line tool safely: no shell, an empty temporary folder, the prompt on
// stdin, and a hard stop on timeout, on cancel, or when the server exits.

import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { coded } from "./errors.mjs";

/** How long any AI tool (CLI or API) gets to answer. */
export const TIMEOUT_MS = 180_000;

const KILL_GRACE_MS = 3_000;
const MAX_REPLY = 1_000_000;
const STDERR_TAIL = 4_000;

/** Why a CLI was stopped before it finished, and the error each reason becomes. */
const STOP_ERRORS = {
  timeout: (/** @type {string} */ bin) => coded("timeout", `${bin} took longer than ${TIMEOUT_MS / 1000}s`),
  cancelled: () => coded("cancelled", "the request was cancelled"),
  too_long: (/** @type {string} */ bin) => coded("provider_error", `${bin} sent back too much text`),
};

/** @typedef {keyof typeof STOP_ERRORS} StopReason */

/** CLIs still running, so they can be stopped if the server exits first. */
const running = new Set();

process.on("exit", () => {
  for (const child of running) killGroup(child, "SIGKILL");
});

/** Whether `bin` is an executable somewhere on PATH. */
export function onPath(/** @type {string} */ bin) {
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
export function runCli(bin, args, { input, signal, env = {}, dropEnv = [] }) {
  if (signal?.aborted) return Promise.reject(STOP_ERRORS.cancelled());

  const cwd = mkdtempSync(path.join(tmpdir(), "cache-warmup-"));
  const child = spawn(bin, typeof args === "function" ? args(cwd) : args, {
    cwd,
    env: childEnv(cwd, env, dropEnv),
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });

  running.add(child);

  return collectOutput(child, bin, input, signal).finally(() => {
    running.delete(child);
    rmSync(cwd, { recursive: true, force: true });
  });
}

/**
 * Sends `input` to a started CLI and resolves with what it prints, or rejects with why it failed.
 * @param {import("node:child_process").ChildProcessWithoutNullStreams} child
 * @param {string} bin
 * @param {string} input
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
function collectOutput(child, bin, input, signal) {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    /** @type {StopReason | null} */
    let stopped = null;
    /** @type {NodeJS.Timeout | undefined} */
    let killTimer;
    const stop = (/** @type {StopReason} */ why) => {
      if (stopped) return;

      stopped = why;
      killGroup(child, "SIGTERM");
      killTimer = setTimeout(() => killGroup(child, "SIGKILL"), KILL_GRACE_MS);
    };

    const onAbort = () => stop("cancelled");
    const timer = setTimeout(() => stop("timeout"), TIMEOUT_MS);
    const stopWatching = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    // Decode as UTF-8 streams, so a character split across chunks stays intact.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (/** @type {string} */ d) => {
      out += d;
      if (out.length > MAX_REPLY) stop("too_long");
    });
    child.stderr.on("data", (/** @type {string} */ d) => (err = (err + d).slice(-STDERR_TAIL)));

    child.on("error", (e) => {
      stopWatching();
      reject(coded("provider_error", `couldn't start ${bin}: ${e.message}`));
    });
    child.on("close", (code, sig) => {
      stopWatching();
      if (stopped) return reject(STOP_ERRORS[stopped](bin));
      if (code === 0) return resolve(out);

      const fallback = sig ? `${bin} was stopped (${sig})` : `${bin} exited with code ${code}`;
      reject(coded("provider_error", lastLine(err) || lastLine(out) || fallback));
    });

    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

/**
 * The CLI's environment: ours, plus `extra`, minus `drop`. PWD points at the temporary
 * folder too, because some CLIs (OpenCode) take the project folder from it, not the real cwd.
 * @param {string} cwd
 * @param {Record<string, string>} extra
 * @param {string[]} drop
 * @returns {NodeJS.ProcessEnv}
 */
function childEnv(cwd, extra, drop) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, ...extra, PWD: cwd };
  for (const name of drop) delete env[name];
  return env;
}

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

/** The last non-empty line of a CLI's output, without color codes: usually its error message. */
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
