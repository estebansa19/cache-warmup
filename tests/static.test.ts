import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createStaticHandler } from "../server/static.mjs";

// The static file server behind `npm start`, serving a small fake dist/ folder.

const root = mkdtempSync(path.join(tmpdir(), "cw-static-"));
const dist = path.join(root, "dist");
let server: http.Server;
let port = 0;

beforeAll(async () => {
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  mkdirSync(path.join(dist, ".git"));
  writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(path.join(dist, "assets", "app.js"), "console.log(1)");
  writeFileSync(path.join(dist, ".env"), "SECRET=1");
  writeFileSync(path.join(dist, ".git", "config"), "[core]");
  writeFileSync(path.join(root, "secret.json"), "{}");
  server = http.createServer(createStaticHandler(dist));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(() => server.close());

/** A raw request, so paths like /../ reach the server exactly as written. */
function get(target: string, host = `localhost:${port}`) {
  return new Promise<{ status: number; head: string }>((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () =>
      socket.write(`GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`),
    );

    let data = "";
    socket.on("data", (c) => (data += c));
    socket.on("end", () => resolve({ status: Number(data.split(" ")[1]), head: data.split("\r\n\r\n")[0] }));
    socket.on("error", reject);
  });
}

describe("static server", () => {
  test("serves the app with security headers", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.head).toMatch(/X-Frame-Options: DENY/i);
    expect(res.head).toMatch(/Content-Security-Policy: .*frame-ancestors 'none'/i);
    expect(res.head).toMatch(/X-Content-Type-Options: nosniff/i);
    expect((await get("/assets/app.js")).status).toBe(200);
  });

  test("never serves dotfiles or dot-folders", async () => {
    expect((await get("/.env")).status).toBe(404);
    expect((await get("/.git/config")).status).toBe(404);
    expect((await get("/assets/%2e%2e/.env")).status).toBe(404);
  });

  test("never serves anything outside dist/", async () => {
    expect((await get("/../secret.json")).status).toBe(404);
    expect((await get("/%2e%2e/secret.json")).status).toBe(404);
    expect((await get("/..%2fsecret.json")).status).toBe(404);
  });

  test("refuses requests addressed to another host name", async () => {
    const res = await get("/", `evil.example:${port}`);
    expect(res.status).toBe(403);
    expect(res.head).toMatch(/X-Frame-Options: DENY/i);
  });

  test("a malformed path is a 400, not a crash", async () => {
    expect((await get("/%E0%A4%A")).status).toBe(400);
    expect((await get("/")).status).toBe(200);
  });
});
