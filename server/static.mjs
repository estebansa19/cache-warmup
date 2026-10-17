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

    const rel = decodePath(req.url);
    if (rel === null) return reply(400);

    const file = fileInFolder(dist, rel);
    if (!file) return reply(404, "Not found");

    try {
      const body = await readFile(file.path);
      res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": file.type, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      reply(404, "Not found");
    }
  };
}

/**
 * The URL's path, decoded. Null for a malformed one, like /%E0.
 * @param {string | undefined} url
 */
function decodePath(url) {
  try {
    return decodeURIComponent(new URL(url ?? "/", "http://localhost").pathname);
  } catch {
    return null;
  }
}

/**
 * The file `rel` points to inside `dist`, with its content type. Null when it may not be
 * served: a dotfile or dot-folder, anything outside `dist`, or a type not in TYPES.
 * @param {string} dist
 * @param {string} rel
 * @returns {{path: string, type: string} | null}
 */
function fileInFolder(dist, rel) {
  if (rel.split(/[\\/]/).some((part) => part.startsWith("."))) return null;

  const file = path.normalize(path.join(dist, rel.endsWith("/") ? rel + "index.html" : rel));
  const type = TYPES[path.extname(file).toLowerCase()];
  return file.startsWith(dist + path.sep) && type ? { path: file, type } : null;
}
