// Shared by `npm start` (server/index.mjs) and `npm run dev` (vite.config.ts), so both
// servers accept the same requests and read the same flags and environment variables.

import { PROVIDERS, providerById } from "./providers.mjs";

/** Host headers that name this machine (with a valid port, if any). Anything else is refused, which blocks DNS rebinding. */
export function isLoopbackHost(/** @type {unknown} */ host) {
  const match = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/.exec(String(host || ""));
  return Boolean(match) && Number(match?.[1] ?? 0) <= 65535;
}

/** Model names: letters, digits, and . : / @ _ -, but not a leading "-", which a CLI would read as a flag. */
export const MODEL_NAME = /^(?!-)[\w.:/@-]{0,100}$/;

export const PROVIDER_CHOICES = ["auto", "off", ...PROVIDERS.map((p) => p.id)];

/**
 * @typedef {{provider: string, model: string}} Preference
 * @typedef {{override: Preference | null, extraOrigins: string[]}} BridgeOptions
 */

/**
 * Bridge options from command-line flags and environment variables. Which tool is used:
 *
 *   1. --provider / --model (flags)
 *   2. CW_PROVIDER / CW_MODEL (environment)
 *   3. the choice saved in cache-warmup.config.json (from Settings)
 *   4. auto: the first tool found
 *
 * 1 and 2 lock the Settings picker. A model needs a provider next to it, because model names
 * belong to one tool. Throws an Error with a message meant for people.
 *
 * @param {{provider?: unknown, model?: unknown}} flags
 * @param {NodeJS.ProcessEnv} env
 * @returns {BridgeOptions}
 */
export function bridgeOptions(flags = {}, env = process.env) {
  const provider = String(flags.provider ?? env.CW_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  const model = String(flags.model ?? env.CW_MODEL ?? "").trim();
  const extraOrigins = String(env.CW_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (!provider) {
    if (model) {
      throw new Error(
        "--model (or CW_MODEL) needs --provider (or CW_PROVIDER) too, because model names belong to one tool.\n" +
          "  Example: npm start -- --provider claude --model sonnet",
      );
    }
    return { override: null, extraOrigins };
  }
  if (!PROVIDER_CHOICES.includes(provider)) {
    throw new Error(`Unknown provider "${provider}". Options: ${PROVIDER_CHOICES.join(", ")}`);
  }
  if (model && (provider === "auto" || provider === "off")) {
    throw new Error(
      `--provider ${provider} doesn't take a model. Name a tool instead, like --provider claude.`,
    );
  }
  if (!MODEL_NAME.test(model)) {
    throw new Error(`The model name "${model}" has characters it shouldn't (or starts with "-").`);
  }
  if (providerById(provider)?.needsModel && !model) {
    throw new Error(`--provider ${provider} needs a model too, for example --model gpt-5-mini.`);
  }
  return { override: { provider, model }, extraOrigins };
}
