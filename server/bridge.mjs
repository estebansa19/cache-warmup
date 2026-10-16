// The AI feedback API. Used by `npm start` (server/index.mjs) and by `npm run dev` (vite.config.ts).
//
//   GET  /api/ai/status    which tool is active, and which ones exist on this machine
//   PUT  /api/ai/config    save a preference: { provider, model }
//   POST /api/ai/feedback  { question, rubric, answer, profile } -> { text, provider }

import path from "node:path";
import { PROVIDERS, CodedError, coded, modelSuggestions } from "./providers.mjs";
import { CONFIG_FILE, readPreference, writePreference } from "./config.mjs";
import { MODEL_NAME, PROVIDER_CHOICES, isLoopbackHost } from "./options.mjs";
import { LIMITS, feedbackPrompt, readFeedbackRequest } from "./prompt.mjs";

/** @typedef {import("./options.mjs").Preference} Preference */
/** @typedef {import("./providers.mjs").Provider} Provider */

// The largest feedback body: every field at its limit, with every character JSON-escaped as \uXXXX.
const MAX_BODY =
  6 * (LIMITS.question + LIMITS.rubricItems * LIMITS.rubricItem + LIMITS.answer + LIMITS.profile) + 4096;

/** Error codes the API answers with. Anything else is reported as a 500 "internal_error". */
const STATUS = {
  bad_request: 400,
  locked: 409,
  busy: 429,
  save_failed: 500,
  provider_error: 502,
  refused: 502,
  no_provider: 503,
  timeout: 504,
};

/**
 * @param {object} [options]
 * @param {Preference | null} [options.override] set by --provider/--model; locks the Settings picker
 * @param {string[]} [options.extraOrigins] other sites allowed to call the API (CW_ALLOWED_ORIGINS)
 * @param {boolean} [options.log] print a line per feedback request
 */
export async function createBridge({ override = null, extraOrigins = [], log = true } = {}) {
  let busy = false;

  // Read on every request, so a hand edit of cache-warmup.config.json applies right away,
  // and `npm start` and `npm run dev` stay in step.
  /** @returns {Preference} */
  function preference() {
    const pref = override ?? readPreference();
    return MODEL_NAME.test(pref.model) ? pref : { ...pref, model: "" };
  }

  /**
   * The tool that would answer right now, checked fresh each time, so a tool you install
   * or log into while the server runs shows up after "Check again".
   * @param {Preference} pref
   * @param {(p: Provider) => boolean | Promise<boolean>} isAvailable
   */
  async function resolve(pref, isAvailable = (p) => p.available()) {
    if (pref.provider === "off") return null;
    // Auto skips tools that can't run without a model name you picked.
    const candidates =
      pref.provider === "auto"
        ? PROVIDERS.filter((p) => !p.needsModel)
        : PROVIDERS.filter((p) => p.id === pref.provider);
    for (const p of candidates) if (await isAvailable(p)) return p;
    return null;
  }

  async function status() {
    const pref = preference();
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
    const active = await resolve(pref, (p) => Boolean(providers.find((info) => info.id === p.id)?.available));
    const model = active && pref.provider === active.id ? pref.model : "";
    return {
      enabled: Boolean(active),
      active: active ? { id: active.id, label: active.label, usage: active.usage, model } : null,
      preference: pref,
      locked: Boolean(override),
      providers,
    };
  }

  /** @param {unknown} next */
  function setPreference(next) {
    const body = /** @type {Record<string, unknown>} */ (next && typeof next === "object" ? next : {});
    const provider = String(body.provider ?? "");
    const model = String(body.model ?? "").trim();
    if (!PROVIDER_CHOICES.includes(provider)) throw coded("bad_request", "Unknown provider.");
    if (!MODEL_NAME.test(model)) throw coded("bad_request", "That model name has characters it shouldn't.");
    try {
      writePreference({ provider, model: provider === "auto" || provider === "off" ? "" : model });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw coded("save_failed", `Couldn't save ${path.basename(CONFIG_FILE)}: ${reason}`);
    }
  }

  /**
   * @param {import("./prompt.mjs").FeedbackRequest} request
   * @param {AbortSignal} signal aborts when the browser stops waiting
   */
  async function feedback(request, signal) {
    if (busy) throw coded("busy", "Another answer is being graded.");
    busy = true;
    try {
      // Fixed for this request, even if the preference changes while it runs.
      const pref = preference();
      const provider = await resolve(pref);
      if (!provider) throw coded("no_provider", "AI feedback is off. Pick a tool in Settings.");
      const model = pref.provider === provider.id ? pref.model : "";
      const started = Date.now();
      try {
        const text = await provider.run(feedbackPrompt(request), model, signal);
        if (log)
          console.log(
            `  ✓ feedback from ${provider.label} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
          );
        return { text, provider: provider.id };
      } catch (e) {
        if (log) console.warn(`  ✗ ${provider.label}: ${e instanceof Error ? e.message : e}`);
        throw e;
      }
    } finally {
      busy = false;
    }
  }

  /**
   * Node http handler for /api/* requests.
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async function handle(req, res) {
    const host = String(req.headers.host || "");
    const origin = req.headers.origin;
    const send = (/** @type {number} */ status, /** @type {unknown} */ body) => {
      if (res.headersSent || res.destroyed) return;
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    const fail = (/** @type {number} */ status, /** @type {string} */ code, /** @type {string} */ message) =>
      send(status, { error: { code, message } });

    // Only answer requests addressed to this machine by name (blocks DNS rebinding),
    // and only from this app or origins you allowed. Other websites open in your
    // browser can't use your AI tool or spend your usage.
    if (!isLoopbackHost(host)) return fail(403, "forbidden_host", "Forbidden.");
    const trusted = typeof origin === "string" && extraOrigins.includes(origin);
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

    try {
      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      if (pathname === "/api/ai/status" && req.method === "GET") return send(200, await status());

      if (req.method !== "POST" && req.method !== "PUT") return fail(404, "not_found", "Unknown endpoint.");
      if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
        return fail(415, "bad_request", "Send JSON.");
      }
      const body = await readJson(req);

      if (pathname === "/api/ai/config" && req.method === "PUT") {
        if (override)
          return fail(
            409,
            "locked",
            "The server was started with --provider (or CW_PROVIDER). Restart without it to choose here.",
          );
        setPreference(body);
        return send(200, await status());
      }

      if (pathname === "/api/ai/feedback" && req.method === "POST") {
        const request = readFeedbackRequest(body);
        // Closing the page or pressing Stop closes the connection: stop the tool too.
        const stop = new AbortController();
        res.on("close", () => {
          if (!res.writableEnded) stop.abort();
        });
        return send(200, await feedback(request, stop.signal));
      }

      return fail(404, "not_found", "Unknown endpoint.");
    } catch (e) {
      if (e instanceof CodedError && e.code === "cancelled") return; // nobody is waiting for an answer
      if (e instanceof CodedError && e.code in STATUS) {
        return fail(STATUS[/** @type {keyof typeof STATUS} */ (e.code)], e.code, e.message);
      }
      console.error(e);
      return fail(500, "internal_error", "Something went wrong in the AI server. Check its terminal.");
    }
  }

  /** What the startup message shows. */
  async function describe() {
    const pref = preference();
    return { active: await resolve(pref), preference: pref, locked: Boolean(override) };
  }

  return { handle, status, describe };
}

/**
 * Reads a JSON body. A body over the limit is read to the end and then refused,
 * so the browser gets the 400 instead of a dropped connection.
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    /** @type {Buffer[]} */
    const chunks = [];
    req.on("data", (/** @type {Buffer} */ c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on("end", () => {
      if (size > MAX_BODY) return reject(coded("bad_request", "Request too large."));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(coded("bad_request", "Couldn't read the request."));
      }
    });
    req.on("error", reject);
  });
}
