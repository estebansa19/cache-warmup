import { describe, expect, test } from "vitest";
import { parseLooseJson } from "../src/ai/client";
import { toFeedback } from "../src/ai/feedback";
import { feedbackPrompt, readFeedbackRequest } from "../server/prompt.mjs";

describe("parseLooseJson", () => {
  test("plain JSON", () => expect(parseLooseJson('{"score": 3}')).toEqual({ score: 3 }));
  test("JSON in a code fence (what Claude Code usually returns)", () =>
    expect(parseLooseJson('```json\n{"score": 4}\n```')).toEqual({ score: 4 }));

  test("JSON with a sentence around it", () =>
    expect(parseLooseJson('Here you go: {"score": 2} Hope it helps.')).toEqual({ score: 2 }));

  test("terminal color codes are ignored", () =>
    expect(parseLooseJson('\x1b[32m{"score": 5}\x1b[0m')).toEqual({ score: 5 }));

  test("garbage gives null", () => expect(parseLooseJson("no json here")).toBeNull());
});

describe("toFeedback", () => {
  test("keeps valid fields and rounds the score", () => {
    expect(
      toFeedback({ score: 3.6, verdict: "ok", strengths: ["a"], gaps: [], tip: "t", followup: "f" }),
    ).toEqual({
      score: 4,
      verdict: "ok",
      strengths: ["a"],
      gaps: [],
      tip: "t",
      followup: "f",
    });
  });

  test("rejects a missing or out-of-range score", () => {
    expect(toFeedback({ verdict: "ok" })).toBeNull();
    expect(toFeedback({ score: 9 })).toBeNull();
  });
});

describe("feedbackPrompt (built on the server)", () => {
  test("includes the question, rubric, answer, and profile", () => {
    const prompt = feedbackPrompt({
      question: "Design an LRU cache",
      rubric: ["hash map", "linked list"],
      answer: "I'd use a map",
      profile: "Staff engineer",
    });

    expect(prompt).toContain("Design an LRU cache");
    expect(prompt).toContain("- hash map\n- linked list");
    expect(prompt).toContain("I'd use a map");
    expect(prompt).toContain("About the candidate: Staff engineer.");
  });

  test("falls back to a generic rubric and profile", () => {
    const prompt = feedbackPrompt({ question: "Q", rubric: null, answer: "A", profile: "  " });
    expect(prompt).toContain("seniority unknown");
    expect(prompt).toContain("trade-offs");
  });
});

describe("readFeedbackRequest", () => {
  const ok = { question: "Q", rubric: ["r"], answer: "A", profile: "" };
  test("accepts the four fields", () => expect(readFeedbackRequest(ok)).toEqual(ok));
  test("a missing profile or rubric is fine", () =>
    expect(readFeedbackRequest({ question: "Q", answer: "A" })).toEqual({
      question: "Q",
      rubric: null,
      answer: "A",
      profile: "",
    }));

  test("refuses anything else", () => {
    expect(() => readFeedbackRequest({ prompt: "anything" })).toThrow(/question/);
    expect(() => readFeedbackRequest({ ...ok, answer: " " })).toThrow(/answer/);
    expect(() => readFeedbackRequest({ ...ok, rubric: [1] })).toThrow(/rubric/);
    expect(() => readFeedbackRequest({ ...ok, question: "x".repeat(5000) })).toThrow(/too long/);
  });
});
