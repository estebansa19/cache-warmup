// The interviewer prompt. It's built here, on the server, so the feedback endpoint only ever
// grades an answer: callers send the pieces, never a prompt of their own.

import { coded } from "./errors.mjs";

/** Longest accepted pieces, in characters. Far above real use; they only stop abuse. */
export const LIMITS = { question: 1_000, rubricItems: 12, rubricItem: 500, answer: 10_000, profile: 2_000 };

/**
 * @typedef {object} FeedbackRequest
 * @property {string} question
 * @property {string[] | null} rubric
 * @property {string} answer
 * @property {string} profile
 */

/**
 * Checks a POST /api/ai/feedback body. Throws a "bad_request" error explaining what's wrong.
 * @param {unknown} body
 * @returns {FeedbackRequest}
 */
export function readFeedbackRequest(body) {
  const fields = /** @type {Record<string, unknown>} */ (body && typeof body === "object" ? body : {});
  const rubric = readRubric(fields.rubric);

  return {
    question: readText(fields, "question"),
    rubric,
    answer: readText(fields, "answer"),
    profile: readText(fields, "profile", { required: false }),
  };
}

/**
 * One text field, checked against its limit.
 * @param {Record<string, unknown>} fields
 * @param {keyof typeof LIMITS} key
 * @returns {string}
 */
function readText(fields, key, { required = true } = {}) {
  const value = fields[key] ?? "";
  if (typeof value !== "string") throw coded("bad_request", `"${key}" must be text.`);
  if (required && !value.trim()) throw coded("bad_request", `"${key}" is empty.`);
  if (value.length > LIMITS[key]) throw coded("bad_request", `"${key}" is too long.`);
  return value;
}

/**
 * The rubric: null, or a short list of short strings.
 * @param {unknown} value
 * @returns {string[] | null}
 */
function readRubric(value = null) {
  if (value === null) return null;
  if (Array.isArray(value) && value.length <= LIMITS.rubricItems && value.every(isShortText)) return value;
  throw coded("bad_request", `"rubric" must be a short list of text, or null.`);
}

/** @param {unknown} item */
function isShortText(item) {
  return typeof item === "string" && item.length <= LIMITS.rubricItem;
}

/** @param {FeedbackRequest} request */
export function feedbackPrompt({ question, rubric, answer, profile }) {
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
