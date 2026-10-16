import type { Feedback } from "../state/progress";

// The prompt itself is built by the server (server/prompt.mjs); this file reads the reply.

const strings = (x: unknown) => (Array.isArray(x) ? x.map(String).slice(0, 5) : []);

/** Turns whatever the model returned into a Feedback, or null if it's unusable. */
export function toFeedback(data: unknown): Feedback | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const score = Math.round(Number(d.score));
  if (!(score >= 1 && score <= 5)) return null;
  return {
    score,
    verdict: String(d.verdict ?? ""),
    strengths: strings(d.strengths),
    gaps: strings(d.gaps),
    tip: String(d.tip ?? ""),
    followup: String(d.followup ?? ""),
  };
}

export const SCORE_LABELS = ["", "No hire yet", "Lean no", "Lean hire", "Hire", "Strong hire"] as const;
