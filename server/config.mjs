// Your AI preference, saved in cache-warmup.config.json at the project root.
// The Settings page writes it; you can also edit it by hand (the server reads it on every request):
//
//   { "provider": "opencode", "model": "" }
//
// provider is "auto" (use the first tool found), "off", or a provider id.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIG_FILE =
  process.env.CW_CONFIG_FILE ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cache-warmup.config.json");

export const DEFAULT_PREFERENCE = { provider: "auto", model: "" };

/** @returns {import("./options.mjs").Preference} */
export function readPreference() {
  try {
    const data = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));

    return {
      provider: typeof data.provider === "string" ? data.provider : "auto",
      model: typeof data.model === "string" ? data.model : "",
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

/** Throws if the file can't be written (read-only folder, disk full). */
export function writePreference(/** @type {import("./options.mjs").Preference} */ preference) {
  writeFileSync(CONFIG_FILE, JSON.stringify(preference, null, 2) + "\n");
}
