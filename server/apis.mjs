// The providers reached over HTTP: Ollama on this machine, and the Anthropic and
// OpenAI-compatible APIs.

import { CodedError, coded } from "./errors.mjs";
import { TIMEOUT_MS } from "./run-cli.mjs";

/** @typedef {import("./providers.mjs").Run} Run */

const OLLAMA_DEFAULT = "http://127.0.0.1:11434";
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

// Server-side fallbacks retry a declined request on a suitable model. Only these models support it.
const ANTHROPIC_FALLBACK_MODELS = [
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
];

/**
 * The Ollama server address. OLLAMA_HOST may be a full URL or Ollama's short forms like
 * "0.0.0.0" or "host:port": no scheme means http and port 11434, and 0.0.0.0 / [::] (listen
 * on every interface) means this machine.
 */
export function ollamaBase(value = process.env.OLLAMA_HOST) {
  const raw = String(value ?? "").trim();
  if (!raw) return OLLAMA_DEFAULT;

  const hasScheme = raw.includes("://");
  const hasPort = /^(\[[^\]]*\]|[^/:]*):\d+/.test(raw);
  const address = raw.startsWith(":") ? `127.0.0.1${raw}` : raw; // ":11434" means this machine

  try {
    const url = new URL(hasScheme ? address : `http://${address}`);
    if (!hasScheme && !hasPort) url.port = "11434";
    if (url.hostname === "0.0.0.0" || url.hostname === "[::]") url.hostname = "127.0.0.1";
    return (url.origin + url.pathname).replace(/\/+$/, "");
  } catch {
    return OLLAMA_DEFAULT;
  }
}

/** The models you've pulled into Ollama, or none if it isn't running. @returns {Promise<string[]>} */
export async function ollamaModels() {
  try {
    const data = await fetchJson(`${ollamaBase()}/api/tags`, {}, { ms: 800 });
    return (data.models || []).map((/** @type {{name: string}} */ m) => m.name);
  } catch {
    return [];
  }
}

/** @type {Run} */
export async function ollamaRun(prompt, model, signal) {
  const chosen = model || (await ollamaModels())[0];
  const data = await fetchJson(
    `${ollamaBase()}/api/chat`,
    postJson({ model: chosen, stream: false, format: "json", messages: [{ role: "user", content: prompt }] }),
    { signal },
  );

  return data.message?.content || "";
}

/** @type {Run} */
export async function anthropicRun(prompt, model, signal) {
  const chosen = model || ANTHROPIC_DEFAULT_MODEL;
  const fallbacks = ANTHROPIC_FALLBACK_MODELS.includes(chosen);
  const data = await fetchJson(
    "https://api.anthropic.com/v1/messages",
    postJson(
      {
        model: chosen,
        max_tokens: 16000,
        ...(fallbacks ? { fallbacks: "default" } : {}),
        messages: [{ role: "user", content: prompt }],
      },
      {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        ...(fallbacks ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      },
    ),
    { signal },
  );
  if (data.stop_reason === "refusal") throw coded("refused", "the model declined to grade this answer");

  return (data.content || [])
    .filter((/** @type {{type: string}} */ b) => b.type === "text")
    .map((/** @type {{text: string}} */ b) => b.text)
    .join("");
}

/** @type {Run} */
export async function openaiRun(prompt, model, signal) {
  if (!model) throw coded("provider_error", "pick a model for the OpenAI-compatible API in Settings");

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const data = await fetchJson(
    `${base}/chat/completions`,
    postJson(
      { model, messages: [{ role: "user", content: prompt }] },
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    ),
    { signal },
  );

  return data.choices?.[0]?.message?.content || "";
}

/**
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 * @returns {RequestInit}
 */
function postJson(body, headers = {}) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
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
