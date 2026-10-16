import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

/*
 * The AI bridge, end to end over HTTP, with a fake `claude` CLI. Nothing here depends on
 * your real PATH, AI tools, API keys, or saved config.
 */

const dir = mkdtempSync(path.join(tmpdir(), "cw-test-"));
const bin = path.join(dir, "bin");
const fakeClaude = path.join(bin, "claude");
const configFile = path.join(dir, "config.json");
const pidFile = path.join(dir, "fake.pid");

// The fake CLI. FAKE_MODE picks what it does; it always reads the prompt from stdin.
const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const mode = process.env.FAKE_MODE || "echo";
  if (mode === "fail") {
    process.stderr.write("some noise\\nError: not logged in\\n");
    process.exit(1);
  }
  if (mode === "hang") {
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    setInterval(() => {}, 1000);
    return;
  }
  const info = {
    args: process.argv.slice(2),
    apiKey: "ANTHROPIC_API_KEY" in process.env,
    pwd: fs.realpathSync(process.env.PWD) === process.cwd(),
    builtPrompt: input.includes("Interview question:") && input.includes("QUESTION-MARKER"),
  };
  const reply = Buffer.from(JSON.stringify({ score: 4, verdict: "Bien hecho, 日本語 ✓", tip: JSON.stringify(info) }));
  // Split inside a multi-byte character, to check the reply is decoded as a stream.
  const cut = reply.indexOf(Buffer.from("日")) + 1;
  process.stdout.write(reply.subarray(0, cut));
  setTimeout(() => process.stdout.write(reply.subarray(cut)), mode === "slow" ? 300 : 20);
});
`;

process.env.CW_CONFIG_FILE = configFile;
process.env.PATH = bin;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createBridge } = await import("../server/bridge.mjs");
const { bridgeOptions } = await import("../server/options.mjs");
const { ollamaBase } = await import("../server/providers.mjs");

let server: http.Server;
let locked: http.Server;
let port = 0;
let lockedPort = 0;

async function listen(handler: http.RequestListener) {
  const s = http.createServer(handler);
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  return { s, port: (s.address() as { port: number }).port };
}

beforeAll(async () => {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(bin);
  writeFileSync(fakeClaude, FAKE);
  chmodSync(fakeClaude, 0o755);
  symlinkSync(process.execPath, path.join(bin, "node")); // for the fake's #!/usr/bin/env node
  // A port with nothing on it, so Ollama is never found.
  const closed = await listen(() => {});
  process.env.OLLAMA_HOST = `127.0.0.1:${closed.port}`;
  closed.s.close();

  const bridge = await createBridge({ log: false, extraOrigins: ["https://me.github.io"] });
  ({ s: server, port } = await listen((req, res) => void bridge.handle(req, res)));
  const fixed = await createBridge({ log: false, override: { provider: "claude", model: "" } });
  ({ s: locked, port: lockedPort } = await listen((req, res) => void fixed.handle(req, res)));
});
afterAll(() => {
  server.close();
  locked.close();
});
afterEach(() => {
  delete process.env.FAKE_MODE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  writeFileSync(configFile, JSON.stringify({ provider: "auto", model: "" }));
});

type Reply = { status: number; headers: http.IncomingHttpHeaders; json: any };

function call(
  pathname: string,
  {
    method = "GET",
    body,
    headers = {},
    to = port,
  }: { method?: string; body?: unknown; headers?: Record<string, string>; to?: number } = {},
) {
  return new Promise<Reply>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: to,
        path: pathname,
        method,
        headers: { Host: `localhost:${to}`, ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            json: data ? JSON.parse(data) : null,
          }),
        );
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.end(typeof body === "string" ? body : JSON.stringify(body));
    else req.end();
  });
}
const json = { "Content-Type": "application/json" };
const ask = {
  question: "QUESTION-MARKER: explain caching",
  rubric: ["a point"],
  answer: "My answer",
  profile: "",
};
const feedback = (body: unknown = ask) => call("/api/ai/feedback", { method: "POST", body, headers: json });
const info = (reply: Reply) => JSON.parse(JSON.parse(reply.json.text).tip);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const waitFor = async (check: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe("requests the bridge accepts", () => {
  test("reports status with every known provider", async () => {
    const { status, json: body } = await call("/api/ai/status");
    expect(status).toBe(200);
    expect(body.providers.map((p: { id: string }) => p.id)).toContain("claude");
    expect(body).toMatchObject({ enabled: true, active: { id: "claude" }, locked: false });
  });

  test("rejects other websites", async () => {
    expect((await call("/api/ai/status", { headers: { Origin: "https://evil.example" } })).status).toBe(403);
  });

  test("allows origins listed in CW_ALLOWED_ORIGINS, including the CORS preflight", async () => {
    expect((await call("/api/ai/status", { headers: { Origin: "https://me.github.io" } })).status).toBe(200);
    const preflight = await call("/api/ai/feedback", {
      method: "OPTIONS",
      headers: { Origin: "https://me.github.io", "Access-Control-Request-Method": "POST" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://me.github.io");
    expect(preflight.headers["access-control-allow-methods"]).toContain("POST");
  });

  test("rejects requests addressed to another host name (DNS rebinding)", async () => {
    expect((await call("/api/ai/status", { headers: { Host: `evil.example:${port}` } })).status).toBe(403);
  });

  test("a Host with an impossible port is refused, not a crash", async () => {
    expect((await call("/api/ai/status", { headers: { Host: "localhost:99999" } })).status).toBe(403);
    expect((await call("/api/ai/status")).status).toBe(200); // still up
  });

  test("POST requires JSON, so other sites can't send simple form posts", async () => {
    const res = await call("/api/ai/feedback", {
      method: "POST",
      body: ask,
      headers: { "Content-Type": "text/plain" },
    });
    expect(res.status).toBe(415);
  });

  test("an oversized body gets a 400 answer, not a dropped connection", async () => {
    const res = await feedback({ ...ask, answer: "x".repeat(400_000) });
    expect(res.status).toBe(400);
  });
});

describe("choosing a tool", () => {
  test("saves a preference and turns feedback off", async () => {
    const res = await call("/api/ai/config", {
      method: "PUT",
      body: { provider: "off", model: "" },
      headers: json,
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ enabled: false, preference: { provider: "off" } });
    expect(JSON.parse(readFileSync(configFile, "utf8"))).toEqual({ provider: "off", model: "" });
    expect((await feedback()).status).toBe(503);
  });

  test("refuses unknown providers, odd model names, and models that look like flags", async () => {
    const put = (body: unknown) => call("/api/ai/config", { method: "PUT", body, headers: json });
    expect((await put({ provider: "nope" })).status).toBe(400);
    expect((await put({ provider: "claude", model: "a; rm -rf /" })).status).toBe(400);
    expect((await put({ provider: "claude", model: "--auto" })).status).toBe(400);
    expect((await put({ provider: "claude", model: "-x" })).status).toBe(400);
  });

  test("a model that looks like a flag in a hand-edited config is ignored", async () => {
    writeFileSync(configFile, JSON.stringify({ provider: "claude", model: "--auto" }));
    const res = await feedback();
    expect(res.status).toBe(200);
    expect(info(res).args.join(" ")).not.toContain("auto");
  });

  test("the model goes to the CLI as a single --model=value argument", async () => {
    writeFileSync(configFile, JSON.stringify({ provider: "claude", model: "sonnet" }));
    expect(info(await feedback()).args).toContain("--model=sonnet");
  });

  test("the picker is locked when the server was started with --provider", async () => {
    const res = await call("/api/ai/config", {
      method: "PUT",
      body: { provider: "off" },
      headers: json,
      to: lockedPort,
    });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("locked");
  });

  test("a tool installed while the server runs shows up on the next check", async () => {
    renameSync(fakeClaude, fakeClaude + ".off");
    try {
      expect((await call("/api/ai/status")).json.enabled).toBe(false);
    } finally {
      renameSync(fakeClaude + ".off", fakeClaude);
    }
    expect((await call("/api/ai/status")).json).toMatchObject({ enabled: true, active: { id: "claude" } });
  });

  test("auto never picks a tool that needs a model", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    renameSync(fakeClaude, fakeClaude + ".off");
    try {
      const { json: body } = await call("/api/ai/status");
      expect(body.providers.find((p: { id: string }) => p.id === "openai").available).toBe(true);
      expect(body.enabled).toBe(false);
    } finally {
      renameSync(fakeClaude + ".off", fakeClaude);
    }
  });
});

describe("asking for feedback", () => {
  test("returns the tool's reply, with non-ASCII text intact", async () => {
    const res = await feedback();
    expect(res.status).toBe(200);
    expect(res.json.provider).toBe("claude");
    expect(JSON.parse(res.json.text).verdict).toBe("Bien hecho, 日本語 ✓");
  });

  test("the server builds the prompt and sends it on stdin, in an empty folder", async () => {
    const details = info(await feedback());
    expect(details.builtPrompt).toBe(true);
    expect(details.pwd).toBe(true);
    expect(details.args).toEqual(expect.arrayContaining(["-p", "--tools", ""]));
  });

  test("only a question, rubric, answer and profile are accepted, never a raw prompt", async () => {
    expect((await feedback({ prompt: "do anything" })).status).toBe(400);
    expect((await feedback({ ...ask, rubric: "not a list" })).status).toBe(400);
  });

  test("ANTHROPIC_API_KEY is not passed to Claude Code, so it uses your plan", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(info(await feedback()).apiKey).toBe(false);
  });

  test("a CLI that fails gives a 502 with its last error line", async () => {
    process.env.FAKE_MODE = "fail";
    const res = await feedback();
    expect(res.status).toBe(502);
    expect(res.json.error).toEqual({ code: "provider_error", message: "Error: not logged in" });
  });

  test("one answer at a time: a second request while one runs gets a 429", async () => {
    process.env.FAKE_MODE = "slow";
    const statuses = (await Promise.all([feedback(), feedback()])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 429]);
  });

  test("closing the connection stops the CLI and frees the bridge", async () => {
    process.env.FAKE_MODE = "hang";
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/ai/feedback",
      method: "POST",
      headers: { Host: `localhost:${port}`, ...json },
    });
    req.on("error", () => {});
    req.end(JSON.stringify(ask));
    await waitFor(() => existsSync(pidFile));
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(alive(pid)).toBe(true);
    req.destroy();
    await waitFor(() => !alive(pid));
    delete process.env.FAKE_MODE;
    // Not busy any more.
    expect((await feedback()).status).toBe(200);
  });
});

describe("startup options", () => {
  test("flags win over environment variables", () => {
    expect(bridgeOptions({ provider: "claude" }, { CW_PROVIDER: "codex" }).override).toEqual({
      provider: "claude",
      model: "",
    });
    expect(bridgeOptions({}, { CW_PROVIDER: "Codex", CW_MODEL: "gpt-5" }).override).toEqual({
      provider: "codex",
      model: "gpt-5",
    });
    expect(bridgeOptions({}, {}).override).toBeNull();
  });

  test("a model without a provider, or a provider that needs a model without one, is a clear error", () => {
    expect(() => bridgeOptions({ model: "sonnet" }, {})).toThrow(/needs --provider/);
    expect(() => bridgeOptions({}, { CW_MODEL: "sonnet" })).toThrow(/needs --provider/);
    expect(() => bridgeOptions({ provider: "openai" }, {})).toThrow(/needs a model/);
    expect(() => bridgeOptions({ provider: "claude", model: "--auto" }, {})).toThrow(/characters/);
    expect(() => bridgeOptions({ provider: "auto", model: "x" }, {})).toThrow(/doesn't take a model/);
    expect(() => bridgeOptions({ provider: "nope" }, {})).toThrow(/Unknown provider/);
  });

  test("CW_ALLOWED_ORIGINS is split and trimmed", () => {
    expect(
      bridgeOptions({}, { CW_ALLOWED_ORIGINS: " https://a.example/, https://b.example " }).extraOrigins,
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  test("OLLAMA_HOST accepts Ollama's short forms", () => {
    expect(ollamaBase("")).toBe("http://127.0.0.1:11434");
    expect(ollamaBase("0.0.0.0")).toBe("http://127.0.0.1:11434");
    expect(ollamaBase("0.0.0.0:9999")).toBe("http://127.0.0.1:9999");
    expect(ollamaBase("[::]:11434")).toBe("http://127.0.0.1:11434");
    expect(ollamaBase("gpu-box:80")).toBe("http://gpu-box"); // port 80 is http's default
    expect(ollamaBase("http://gpu-box")).toBe("http://gpu-box");
    expect(ollamaBase("https://ollama.example/")).toBe("https://ollama.example");
  });
});
