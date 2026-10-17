// Shared by `npm start` (server/index.mjs) and `npm run dev` (vite.config.ts), so both
// servers accept the same requests and read the same flags and environment variables.

import { PROVIDERS, providerById } from "./providers.mjs";

/** Model names: letters, digits, and . : / @ _ -, but not a leading "-", which a CLI would read as a flag. */
export const MODEL_NAME = /^(?!-)[\w.:/@-]{0,100}$/;

export const PROVIDER_CHOICES = ["auto", "off", ...PROVIDERS.map((p) => p.id)];

/**
 * @typedef {{provider: string, model: string}} Preference
 * @typedef {{override: Preference | null, extraOrigins: string[]}} BridgeOptions
 */

/**
 * What can be wrong with a --provider/--model pair (or CW_PROVIDER/CW_MODEL), checked in order.
 * Each message is meant for people.
 * @type {{ test: (pref: Preference) => boolean, message: (pref: Preference) => string }[]}
 */
const OVERRIDE_PROBLEMS = [
  {
    test: ({ provider, model }) => !provider && Boolean(model),
    message: () =>
      "--model (or CW_MODEL) needs --provider (or CW_PROVIDER) too, because model names belong to one tool.\n" +
      "  Example: npm start -- --provider claude --model sonnet",
  },
  {
    test: ({ provider }) => Boolean(provider) && !PROVIDER_CHOICES.includes(provider),
    message: ({ provider }) => `Unknown provider "${provider}". Options: ${PROVIDER_CHOICES.join(", ")}`,
  },
  {
    test: ({ provider, model }) => Boolean(model) && (provider === "auto" || provider === "off"),
    message: ({ provider }) =>
      `--provider ${provider} doesn't take a model. Name a tool instead, like --provider claude.`,
  },
  {
    test: ({ model }) => !MODEL_NAME.test(model),
    message: ({ model }) => `The model name "${model}" has characters it shouldn't (or starts with "-").`,
  },
  {
    test: ({ provider, model }) => !model && Boolean(providerById(provider)?.needsModel),
    message: ({ provider }) => `--provider ${provider} needs a model too, for example --model gpt-5-mini.`,
  },
];

/**
 * Bridge options from command-line flags and environment variables. Which tool is used:
 *
 *   1. --provider / --model (flags)
 *   2. CW_PROVIDER / CW_MODEL (environment)
 *   3. the choice saved in cache-warmup.config.json (from Settings)
 *   4. auto: the first tool found
 *
 * 1 and 2 lock the Settings picker. Throws an Error when they don't make sense together
 * (see OVERRIDE_PROBLEMS).
 *
 * @param {{provider?: unknown, model?: unknown}} flags
 * @param {NodeJS.ProcessEnv} env
 * @returns {BridgeOptions}
 */
export function bridgeOptions(flags = {}, env = process.env) {
  const override = {
    provider: String(flags.provider ?? env.CW_PROVIDER ?? "")
      .trim()
      .toLowerCase(),
    model: String(flags.model ?? env.CW_MODEL ?? "").trim(),
  };

  const problem = OVERRIDE_PROBLEMS.find((p) => p.test(override));
  if (problem) throw new Error(problem.message(override));

  return {
    override: override.provider ? override : null,
    extraOrigins: allowedOrigins(env.CW_ALLOWED_ORIGINS),
  };
}

/** CW_ALLOWED_ORIGINS as a list, without trailing slashes. */
function allowedOrigins(/** @type {string | undefined} */ value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** Host headers that name this machine (with a valid port, if any). Anything else is refused, which blocks DNS rebinding. */
export function isLoopbackHost(/** @type {unknown} */ host) {
  const match = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/.exec(String(host || ""));
  return Boolean(match) && Number(match?.[1] ?? 0) <= 65535;
}
