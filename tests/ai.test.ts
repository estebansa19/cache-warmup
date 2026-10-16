import { describe, expect, test } from "vitest";
import { parseLooseJson } from "../src/ai/client";
import { feedbackPrompt, toFeedback } from "../src/ai/prompt";

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

describe("feedbackPrompt", () => {
  test("includes the question, rubric, answer, and profile", () => {
    const prompt = feedbackPrompt(
      { question: "Design an LRU cache", rubric: ["hash map", "linked list"] },
      "I'd use a map",
      "Staff engineer",
    );
    expect(prompt).toContain("Design an LRU cache");
    expect(prompt).toContain("- hash map\n- linked list");
    expect(prompt).toContain("I'd use a map");
    expect(prompt).toContain("About the candidate: Staff engineer.");
  });
  test("falls back to a generic rubric and profile", () => {
    const prompt = feedbackPrompt({ question: "Q", rubric: null }, "A", "  ");
    expect(prompt).toContain("seniority unknown");
    expect(prompt).toContain("trade-offs");
  });
});
