import { z } from "zod/mini";
import type { Feedback } from "../state/progress";
import { toFeedback } from "./feedback";

/*
 * Talks to the local AI bridge (server/bridge.mjs). With `npm start` or `npm run dev`
 * it's on the same address as the app; for a hosted copy, Settings can point it elsewhere.
 * Every reply is checked before the app uses it.
 */

const providerSchema = z.object({
  id: z.string(),
  label: z.string(),
  usage: z.string(),
  hint: z.string(),
  needsModel: z.boolean(),
  available: z.boolean(),
  models: z.array(z.string()),
});

const preferenceSchema = z.object({ provider: z.string(), model: z.string() });

const statusSchema = z.object({
  enabled: z.boolean(),
  active: z.nullable(z.object({ id: z.string(), label: z.string(), usage: z.string(), model: z.string() })),
  preference: preferenceSchema,
  locked: z.boolean(),
  providers: z.array(providerSchema),
});

const feedbackReplySchema = z.object({ text: z.string(), provider: z.string() });

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.optional(z.string()) }) });

export type ProviderInfo = z.infer<typeof providerSchema>;
export type Preference = z.infer<typeof preferenceSchema>;
export type AIStatus = z.infer<typeof statusSchema>;

/** What the interviewer grades. The server turns it into the prompt. */
export type FeedbackRequest = { question: string; rubric: string[] | null; answer: string; profile: string };

export class AIError extends Error {
  constructor(
    public code: string,
    message = "",
  ) {
    super(message || code);
  }
}

async function call<T>(
  base: string,
  path: string,
  schema: z.ZodMiniType<T>,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<T> {
  const signals = [init.signal, timeoutMs ? AbortSignal.timeout(timeoutMs) : null].filter((s) => s != null);
  let res: Response;
  try {
    res = await fetch(base + path, { ...init, signal: AbortSignal.any(signals), cache: "no-store" });
  } catch {
    if (init.signal?.aborted) throw new AIError("cancelled");
    throw new AIError("unreachable");
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = z.safeParse(errorSchema, data);
    throw error.success
      ? new AIError(error.data.error.code, error.data.error.message)
      : new AIError("unreachable");
  }
  const parsed = z.safeParse(schema, data);
  if (!parsed.success)
    throw new AIError("bad_response", "The AI server sent a reply this app doesn't understand.");
  return parsed.data;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getStatus = (base: string, signal?: AbortSignal) =>
  call(base, "/api/ai/status", statusSchema, { signal }, 4000);

export const savePreference = (base: string, preference: Preference) =>
  call(base, "/api/ai/config", statusSchema, json("PUT", preference));

export async function requestFeedback(
  base: string,
  request: FeedbackRequest,
  signal: AbortSignal,
): Promise<Feedback> {
  const { text } = await call(base, "/api/ai/feedback", feedbackReplySchema, {
    ...json("POST", request),
    signal,
  });
  const feedback = toFeedback(parseLooseJson(text));
  if (!feedback) throw new AIError("invalid_json");
  return feedback;
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
