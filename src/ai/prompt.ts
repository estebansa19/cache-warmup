import type { Feedback } from "../state/progress";

export type InterviewQuestion = { question: string; rubric: string[] | null };

export function feedbackPrompt(
  { question, rubric }: InterviewQuestion,
  answer: string,
  profile: string,
): string {
  const about = profile.trim() ? profile.trim().slice(0, 600) : "a software engineer (seniority unknown)";
  const criteria = rubric?.length
    ? "A strong answer usually covers:\n- " + rubric.join("\n- ")
    : "Judge it as a senior-level interviewer would: correctness, depth, a concrete example, trade-offs, and clarity.";

  return `You are a friendly but rigorous senior engineering interviewer at a strong product company.
About the candidate: ${about}.
They are practicing to keep their fundamentals fresh, not cramming. Calibrate expectations to their stated level.

Interview question:
${question}

${criteria}

Candidate's answer:
"""
${answer.slice(0, 8000)}
"""

Evaluate this specific answer and refer to what they actually wrote. Be direct and encouraging, in plain, casual language. Keep each list item under 25 words. Max 4 strengths and 4 gaps.
Reply with only JSON in this shape:
{"score": 3, "verdict": "one-sentence overall read", "strengths": ["..."], "gaps": ["..."], "tip": "one concrete thing to say differently next time", "followup": "the follow-up question you would ask next"}
score is an integer from 1 to 5: 1 = no hire, 2 = lean no, 3 = lean hire, 4 = hire, 5 = strong hire.`;
}

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
