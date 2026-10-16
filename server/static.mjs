// Serves the built app (dist/) for `npm start`. Only to this machine, only files that exist,
// and never dotfiles or anything outside the folder.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { isLoopbackHost } from "./options.mjs";

/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

// Everything the app needs comes from this server (fonts included). connect-src also allows
// the other spellings of localhost, for the "server address" setting.
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' http://localhost:* http://127.0.0.1:*",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};

/** @param {string} dist the folder to serve */
export function createStaticHandler(dist) {
  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  return async function serveStatic(req, res) {
    const reply = (/** @type {number} */ status, /** @type {string} */ text = "") => {
      res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
      res.end(text);
    };
    if (!isLoopbackHost(req.headers.host)) return reply(403, "Forbidden");
    if (req.method !== "GET" && req.method !== "HEAD") return reply(405);
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      return reply(400);
    }
    // No dotfiles or dot-folders, and no "..".
    if (rel.split(/[\\/]/).some((part) => part.startsWith("."))) return reply(404, "Not found");
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(dist, rel));
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!file.startsWith(dist + path.sep) || !type) return reply(404, "Not found");
    try {
      const body = await readFile(file);
      res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      reply(404, "Not found");
    }
  };
}
