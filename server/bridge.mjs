// The AI feedback API. Used by `npm start` (server/index.mjs) and by `npm run dev` (vite.config.ts).
//
//   GET  /api/ai/status    which tool is active, and which ones exist on this machine
//   PUT  /api/ai/config    save a preference: { provider, model }
//   POST /api/ai/feedback  { prompt } -> { text }

import { PROVIDERS, coded, modelSuggestions, providerById } from "./providers.mjs";
import { readPreference, writePreference } from "./config.mjs";

const MAX_PROMPT = 40_000;
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MODEL_NAME = /^[\w.:/@-]{0,100}$/;

/**
 * @param {object} options
 * @param {{provider: string, model: string} | null} [options.override] set by --provider/--model; locks the Settings picker
 * @param {string[]} [options.extraOrigins] other sites allowed to call the API (CW_ALLOWED_ORIGINS)
 * @param {boolean} [options.log] print a line per feedback request
 */
export async function createBridge({ override = null, extraOrigins = [], log = true } = {}) {
  let preference = override ?? readPreference();
  let active = await resolve(preference);
  let busy = false;

  async function resolve(pref) {
    if (pref.provider === "off") return null;
    if (pref.provider === "auto") {
      for (const p of PROVIDERS) if (await p.available()) return p;
      return null;
    }
    const p = providerById(pref.provider);
    return p && (await p.available()) ? p : null;
  }

  async function status() {
    const providers = await Promise.all(
      PROVIDERS.map(async (p) => ({
        id: p.id,
        label: p.label,
        usage: p.usage,
        hint: p.hint,
        needsModel: Boolean(p.needsModel),
        available: Boolean(await p.available()),
        models: await modelSuggestions(p),
      })),
    );
    const model = active && preference.provider === active.id ? preference.model : "";
    return {
      enabled: Boolean(active),
      active: active ? { id: active.id, label: active.label, usage: active.usage, model } : null,
      preference,
      locked: Boolean(override),
      providers,
    };
  }

  async function setPreference(next) {
    const provider = String(next?.provider ?? "");
    const model = String(next?.model ?? "").trim();
    if (!["auto", "off"].includes(provider) && !providerById(provider))
      throw coded("bad_request", "Unknown provider.");
    if (!MODEL_NAME.test(model)) throw coded("bad_request", "That model name has characters it shouldn't.");
    preference = { provider, model: ["auto", "off"].includes(provider) ? "" : model };
    writePreference(preference);
    active = await resolve(preference);
  }

  async function feedback(prompt) {
    if (!active) throw coded("no_provider", "AI feedback is off. Pick a tool in Settings.");
    if (busy) throw coded("busy", "Another answer is being graded.");
    busy = true;
    const started = Date.now();
    try {
      const model = preference.provider === active.id ? preference.model : "";
      const text = await active.run(prompt, model);
      if (log)
        console.log(`  ✓ feedback from ${active.label} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return text;
    } catch (e) {
      if (log) console.warn(`  ✗ ${active.label}: ${e.message}`);
      throw e;
    } finally {
      busy = false;
    }
  }

  /** Node http handler for /api/* requests. */
  async function handle(req, res) {
    const host = String(req.headers.host || "");
    const origin = req.headers.origin;
    const send = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    const fail = (status, code, message) => send(status, { error: { code, message } });

    // Only answer requests addressed to this machine by name (blocks DNS rebinding),
    // and only from this app or origins you allowed. Other websites open in your
    // browser can't use your AI tool or spend your usage.
    if (!LOOPBACK.test(host)) return fail(403, "forbidden_host", "Forbidden.");
    const trusted = extraOrigins.includes(origin);
    if (origin && origin !== `http://${host}` && !trusted) {
      return fail(403, "forbidden_origin", `Origin ${origin} isn't allowed. Add it to CW_ALLOWED_ORIGINS.`);
    }
    if (trusted) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${host}`);
    try {
      if (url.pathname === "/api/ai/status" && req.method === "GET") return send(200, await status());

      if (req.method !== "POST" && req.method !== "PUT") return fail(404, "not_found", "Unknown endpoint.");
      if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
        return fail(415, "bad_request", "Send JSON.");
      }
      const body = await readJson(req);

      if (url.pathname === "/api/ai/config" && req.method === "PUT") {
        if (override)
          return fail(
            409,
            "locked",
            "The server was started with --provider. Restart without it to choose here.",
          );
        await setPreference(body);
        return send(200, await status());
      }

      if (url.pathname === "/api/ai/feedback" && req.method === "POST") {
        const prompt = String(body?.prompt || "");
        if (!prompt.trim() || prompt.length > MAX_PROMPT)
          return fail(400, "bad_request", "The prompt is empty or too long.");
        const text = await feedback(prompt);
        return send(200, { text, provider: active?.id });
      }

      return fail(404, "not_found", "Unknown endpoint.");
    } catch (e) {
      const status = { bad_request: 400, busy: 429, no_provider: 503 }[e.code] || 502;
      return fail(status, e.code || "provider_error", e.message);
    }
  }

  return { handle, status, describe: () => ({ active, preference, locked: Boolean(override) }) };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_PROMPT * 2) {
        reject(coded("bad_request", "Request too large."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(coded("bad_request", "Couldn't read the request."));
      }
    });
    req.on("error", reject);
  });
}
