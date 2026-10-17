import { describe, expect, test } from "vitest";
import { cardByKey, extraQuestions, legacy, lessons } from "../src/content/lessons";
import { LessonError, parseLesson, textOf } from "../src/content/parse-lesson";
import { isCheck } from "../src/content/types";

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
          // Every option has text, no two read the same, so the marked answer is a real choice.
          const options = step.options.map((o) => textOf(o).trim());
          expect(options.length).toBeGreaterThanOrEqual(2);
          expect(options.every(Boolean)).toBe(true);
          expect(new Set(options).size).toBe(options.length);
        }

        if (step.kind === "order") expect(step.itemText.every(Boolean)).toBe(true);
        if (step.kind === "read") expect(step.title).not.toBe("");
      }
    },
  );

  test("every check and card has a saved-progress key, and version 1 keys map onto them", () => {
    for (const lesson of lessons) {
      const checks = lesson.steps.filter(isCheck).length;
      expect(legacy.get(lesson.id)?.steps.filter(Boolean).length).toBe(checks);
      expect(legacy.get(lesson.id)?.cards.length).toBe(lesson.cards.length);
    }

    expect(cardByKey.size).toBe(lessons.reduce((n, l) => n + l.cards.length, 0));
  });

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
