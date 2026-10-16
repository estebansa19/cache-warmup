import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Point the saved preference at a temp file before the bridge loads.
process.env.CW_CONFIG_FILE = path.join(mkdtempSync(path.join(tmpdir(), "cw-test-")), "config.json");
const { createBridge } = await import("../server/bridge.mjs");

let server: http.Server;
let port = 0;

beforeAll(async () => {
  const bridge = await createBridge({ log: false, extraOrigins: ["https://me.github.io"] });
  server = http.createServer((req, res) => bridge.handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});
afterAll(() => server.close());

function call(
  pathname: string,
  {
    method = "GET",
    body,
    headers = {},
  }: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: pathname, method, headers: { Host: `localhost:${port}`, ...headers } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: data ? JSON.parse(data) : null }));
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.end(JSON.stringify(body));
    else req.end();
  });
}
const json = { "Content-Type": "application/json" };

describe("AI bridge", () => {
  test("reports status with every known provider", async () => {
    const { status, json: body } = await call("/api/ai/status");
    expect(status).toBe(200);
    expect(body.providers.map((p: { id: string }) => p.id)).toContain("claude");
    expect(body.locked).toBe(false);
  });

  test("rejects other websites", async () => {
    const res = await call("/api/ai/status", { headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  test("allows origins listed in CW_ALLOWED_ORIGINS", async () => {
    const res = await call("/api/ai/status", { headers: { Origin: "https://me.github.io" } });
    expect(res.status).toBe(200);
  });

  test("rejects requests addressed to another host name (DNS rebinding)", async () => {
    const res = await call("/api/ai/status", { headers: { Host: `evil.example:${port}` } });
    expect(res.status).toBe(403);
  });

  test("POST requires JSON, so other sites can't send simple form posts", async () => {
    const res = await call("/api/ai/feedback", {
      method: "POST",
      body: { prompt: "hi" },
      headers: { "Content-Type": "text/plain" },
    });
    expect(res.status).toBe(415);
  });

  test("saves a preference and turns feedback off", async () => {
    const res = await call("/api/ai/config", {
      method: "PUT",
      body: { provider: "off", model: "" },
      headers: json,
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ enabled: false, preference: { provider: "off" } });
    const feedback = await call("/api/ai/feedback", {
      method: "POST",
      body: { prompt: "hi" },
      headers: json,
    });
    expect(feedback.status).toBe(503);
  });

  test("refuses unknown providers and odd model names", async () => {
    expect(
      (await call("/api/ai/config", { method: "PUT", body: { provider: "nope" }, headers: json })).status,
    ).toBe(400);
    const odd = await call("/api/ai/config", {
      method: "PUT",
      body: { provider: "claude", model: "a; rm -rf /" },
      headers: json,
    });
    expect(odd.status).toBe(400);
  });
});
