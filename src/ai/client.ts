/*
 * Talks to the local AI bridge (server/bridge.mjs). With `npm start` or `npm run dev`
 * it's on the same address as the app; for a hosted copy, Settings can point it elsewhere.
 */

export type ProviderInfo = {
  id: string;
  label: string;
  usage: string;
  hint: string;
  needsModel: boolean;
  available: boolean;
  models: string[];
};

export type Preference = { provider: string; model: string };

export type AIStatus = {
  enabled: boolean;
  active: { id: string; label: string; usage: string; model: string } | null;
  preference: Preference;
  locked: boolean;
  providers: ProviderInfo[];
};

export class AIError extends Error {
  constructor(
    public code: string,
    message = "",
  ) {
    super(message || code);
  }
}

async function call<T>(base: string, path: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const ctl = new AbortController();
  const outer = init.signal;
  outer?.addEventListener("abort", () => ctl.abort());
  const timer = timeoutMs ? setTimeout(() => ctl.abort(), timeoutMs) : undefined;
  let res: Response;
  try {
    res = await fetch(base + path, { ...init, signal: ctl.signal, cache: "no-store" });
  } catch {
    if (outer?.aborted) throw new AIError("cancelled");
    throw new AIError("unreachable");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new AIError(data?.error?.code ?? "unreachable", data?.error?.message);
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getStatus = (base: string) => call<AIStatus>(base, "/api/ai/status", {}, 4000);

export const savePreference = (base: string, preference: Preference) =>
  call<AIStatus>(base, "/api/ai/config", json("PUT", preference));

export async function requestJson(base: string, prompt: string, signal: AbortSignal): Promise<unknown> {
  const { text } = await call<{ text: string }>(base, "/api/ai/feedback", {
    ...json("POST", { prompt }),
    signal,
  });
  const parsed = parseLooseJson(text);
  if (parsed === null) throw new AIError("invalid_json");
  return parsed;
}

/** Models often wrap JSON in a code fence or add a sentence around it. Find the JSON anyway. */
export function parseLooseJson(text: string): unknown {
  const t = String(text ?? "")
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .trim();
  const attempts = [t, /```(?:json)?\s*([\s\S]*?)```/.exec(t)?.[1]];
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) attempts.push(t.slice(first, last + 1));
  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next shape */
    }
  }
  return null;
}
