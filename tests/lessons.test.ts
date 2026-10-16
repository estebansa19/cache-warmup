import { describe, expect, test } from "vitest";
import { extraQuestions, lessons } from "../src/content/lessons";
import { LessonError, parseLesson } from "../src/content/parse-lesson";

// Every lesson file is loaded and validated here, so a broken lesson fails CI with a readable message.

describe("lessons", () => {
  test("are numbered 1..n with no gaps", () => {
    expect(lessons.map((l) => l.n)).toEqual(lessons.map((_, i) => i + 1));
  });

  test.each(lessons.map((l) => [l.n, l.title, l] as const))(
    "lesson %i (%s) is complete",
    (_n, _title, lesson) => {
      expect(lesson.hook.length).toBeGreaterThan(0);
      expect(lesson.steps.some((s) => s.kind === "read")).toBe(true);
      expect(lesson.steps.some((s) => s.kind !== "read")).toBe(true);
      expect(lesson.interview.question.length).toBeGreaterThan(20);
      expect(lesson.interview.rubric.length).toBeGreaterThanOrEqual(3);
      expect(lesson.cards.length).toBeGreaterThanOrEqual(4);
      for (const step of lesson.steps) {
        if (step.kind === "quiz") {
          expect(step.options.length).toBeGreaterThanOrEqual(2);
          expect(step.answer).toBeLessThan(step.options.length);
        }
        if (step.kind === "order") expect(step.itemText.every(Boolean)).toBe(true);
        if (step.kind === "read") expect(step.title).not.toBe("");
      }
    },
  );

  test("extra questions have unique ids", () => {
    const ids = extraQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("x-"))).toBe(true);
  });
});

describe("parseLesson errors are readable", () => {
  const body = () => null;
  test("bad frontmatter names the file and the field", () => {
    expect(() =>
      parseLesson("src/lessons/15-new.mdx", { default: body, frontmatter: { id: "new" } }),
    ).toThrow(/15-new\.mdx: check the frontmatter: title/);
  });
  test("file names need a lesson number", () => {
    expect(() => parseLesson("src/lessons/new.mdx", { default: body, frontmatter: {} })).toThrow(LessonError);
  });
});
