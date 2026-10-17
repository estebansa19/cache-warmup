// The AI feedback API. Used by `npm start` (server/index.mjs) and by `npm run dev` (vite.config.ts).
//
//   GET  /api/ai/status    which tool is active, and which ones exist on this machine
//   PUT  /api/ai/config    save a preference: { provider, model }
//   POST /api/ai/feedback  { question, rubric, answer, profile } -> { text, provider }

import path from "node:path";
import { CodedError, coded } from "./errors.mjs";
import { PROVIDERS, modelSuggestions } from "./providers.mjs";
import { CONFIG_FILE, readPreference, writePreference } from "./config.mjs";
import { MODEL_NAME, PROVIDER_CHOICES, isLoopbackHost } from "./options.mjs";
import { LIMITS, feedbackPrompt, readFeedbackRequest } from "./prompt.mjs";

/** @typedef {import("./options.mjs").Preference} Preference */
/** @typedef {import("./providers.mjs").Provider} Provider */
/** @typedef {import("node:http").IncomingMessage} IncomingMessage */
/** @typedef {import("node:http").ServerResponse} ServerResponse */

// The largest feedback body: every field at its limit, with every character JSON-escaped as \uXXXX.
const MAX_BODY =
  6 * (LIMITS.question + LIMITS.rubricItems * LIMITS.rubricItem + LIMITS.answer + LIMITS.profile) + 4096;

/** Error codes the API answers with, and their HTTP status. Anything else is a 500 "internal_error". */
const STATUS = {
  bad_request: 400,
  forbidden_host: 403,
  forbidden_origin: 403,
  not_found: 404,
  locked: 409,
  not_json: 415,
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
  const report = (/** @type {string} */ message, /** @type {"log" | "warn"} */ level = "log") => {
    if (log) console[level](message);
  };

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
    const providers = await Promise.all(PROVIDERS.map(providerInfo));
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
      return await grade(request, signal);
    } finally {
      busy = false;
    }
  }

  /**
   * Asks the active tool to grade an answer, and logs how it went.
   * @param {import("./prompt.mjs").FeedbackRequest} request
   * @param {AbortSignal} signal
   */
  async function grade(request, signal) {
    // Fixed for this request, even if the preference changes while it runs.
    const pref = preference();
    const provider = await resolve(pref);
    if (!provider) throw coded("no_provider", "AI feedback is off. Pick a tool in Settings.");

    const model = pref.provider === provider.id ? pref.model : "";
    const started = Date.now();

    try {
      const text = await provider.run(feedbackPrompt(request), model, signal);
      report(`  ✓ feedback from ${provider.label} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return { text, provider: provider.id };
    } catch (e) {
      report(`  ✗ ${provider.label}: ${e instanceof Error ? e.message : e}`, "warn");
      throw e;
    }
  }

  /**
   * The API, one handler per "METHOD /path". Each gets the JSON body and returns the reply.
   * @type {Record<string, (body: unknown, res: ServerResponse) => Promise<unknown>>}
   */
  const routes = {
    "GET /api/ai/status": () => status(),

    "PUT /api/ai/config": async (body) => {
      if (override) {
        throw coded(
          "locked",
          "The server was started with --provider (or CW_PROVIDER). Restart without it to choose here.",
        );
      }

      setPreference(body);
      return status();
    },

    "POST /api/ai/feedback": (body, res) => feedback(readFeedbackRequest(body), abortOnClose(res)),
  };

  /**
   * Node http handler for /api/* requests.
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   */
  async function handle(req, res) {
    try {
      const crossOrigin = checkCaller(req, extraOrigins);
      if (crossOrigin) allowCrossOrigin(res, crossOrigin);

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }

      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      const route = routes[`${req.method} ${pathname}`];
      if (!route) throw coded("not_found", "Unknown endpoint.");

      const body = req.method === "GET" ? null : await readJson(req);
      sendJson(res, 200, await route(body, res));
    } catch (e) {
      sendError(res, e);
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
 * What the Settings picker shows about one provider.
 * @param {Provider} p
 */
async function providerInfo(p) {
  return {
    id: p.id,
    label: p.label,
    usage: p.usage,
    hint: p.hint,
    needsModel: Boolean(p.needsModel),
    available: Boolean(await p.available()),
    models: await modelSuggestions(p),
  };
}

/**
 * @param {ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  if (res.headersSent || res.destroyed) return;

  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/**
 * Only answer requests addressed to this machine by name (blocks DNS rebinding), and only
 * from this app or origins you allowed: other websites open in your browser can't use your
 * AI tool or spend your usage. Returns the origin to allow when it's another allowed site.
 * @param {IncomingMessage} req
 * @param {string[]} extraOrigins
 * @returns {string | null}
 */
function checkCaller(req, extraOrigins) {
  const host = String(req.headers.host || "");
  const origin = req.headers.origin;
  if (!isLoopbackHost(host)) throw coded("forbidden_host", "Forbidden.");
  if (!origin || origin === `http://${host}`) return null;

  if (!extraOrigins.includes(origin)) {
    throw coded("forbidden_origin", `Origin ${origin} isn't allowed. Add it to CW_ALLOWED_ORIGINS.`);
  }

  return origin;
}

/**
 * Answers with a coded error's status and message. A cancelled request gets no answer:
 * nobody is waiting for it.
 * @param {ServerResponse} res
 * @param {unknown} error
 */
function sendError(res, error) {
  if (error instanceof CodedError && error.code === "cancelled") return;

  if (error instanceof CodedError && error.code in STATUS) {
    const status = STATUS[/** @type {keyof typeof STATUS} */ (error.code)];
    return sendJson(res, status, { error: { code: error.code, message: error.message } });
  }

  console.error(error);
  sendJson(res, 500, {
    error: { code: "internal_error", message: "Something went wrong in the AI server. Check its terminal." },
  });
}

/**
 * CORS headers for an origin listed in CW_ALLOWED_ORIGINS.
 * @param {ServerResponse} res
 * @param {string} origin
 */
function allowCrossOrigin(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

/**
 * An AbortSignal that fires when the browser closes the connection (closing the page, or Stop),
 * so the AI tool stops too.
 * @param {ServerResponse} res
 */
function abortOnClose(res) {
  const stop = new AbortController();

  res.on("close", () => {
    if (!res.writableEnded) stop.abort();
  });

  return stop.signal;
}

/**
 * Reads a JSON body. A body over the limit is read to the end and then refused,
 * so the browser gets the 400 instead of a dropped connection.
 * @param {IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJson(req) {
  // Requiring JSON means other sites can't send simple form posts.
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
    return Promise.reject(coded("not_json", "Send JSON."));
  }

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
