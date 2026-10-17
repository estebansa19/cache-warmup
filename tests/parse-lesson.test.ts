import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { describe, expect, test } from "vitest";
import { mdxComponents } from "../src/content/mdx-components";
import { LessonError, parseLesson, type LessonModule } from "../src/content/parse-lesson";

/*
 * Every way a lesson can be written wrong, compiled from small MDX snippets with the same
 * plugins the app uses. The text is placeholder text, not real lesson content.
 */

const FRONTMATTER = `---
id: "sample"
title: "A sample lesson"
track: "Craft"
mins: 5
tag: "For tests."
cards:
  - ["Front one?", "Back one."]
  - ["Front two?", "Back two."]
---`;

const QUIZ = `<Quiz>

Pick B.

- [ ] A
- [x] B

<Why>Because.</Why>

</Quiz>`;

const END = `<Interview>

Tell me about it.

<Rubric>

- One point

</Rubric>

<Answer>An answer.</Answer>

</Interview>

<CheatSheet>

- A takeaway

</CheatSheet>`;

function lesson({
  frontmatter = FRONTMATTER,
  body = `## A heading\n\nSome text.\n\n${QUIZ}`,
  end = END,
} = {}) {
  return [frontmatter, "An intro.", body, end].join("\n\n");
}

async function compile(source: string): Promise<LessonModule> {
  return (await evaluate(source, {
    ...runtime,
    remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
  })) as unknown as LessonModule;
}

async function parse(source: string, file = "src/lessons/15-sample.mdx") {
  return parseLesson(file, await compile(source));
}

describe("parseLesson", () => {
  test("a complete lesson parses into steps", async () => {
    const result = await parse(lesson());
    expect(result).toMatchObject({ id: "sample", n: 15, track: "Craft" });
    expect(result.steps.map((s) => s.kind)).toEqual(["read", "quiz"]);
    expect(result.interview.rubric).toEqual(["One point"]);
    expect(result.cards.map((c) => c.front)).toEqual(["Front one?", "Front two?"]);
  });

  test("blank lines between quiz options are fine (MDX wraps each option in a <p>)", async () => {
    const loose = `<Quiz>\n\nPick B.\n\n- [ ] A\n\n- [x] B\n\n- [ ] C\n\n<Why>Because.</Why>\n\n</Quiz>`;
    const quiz = (await parse(lesson({ body: `## H\n\nText.\n\n${loose}` }))).steps[1];
    expect(quiz).toMatchObject({ kind: "quiz", answer: 1 });
    expect(quiz.kind === "quiz" && quiz.options.length).toBe(3);
  });

  test("checks get stable ids: the id prop, or a hash of their text", async () => {
    const named = `<Myth id="my-myth" fact={false}>\n\nA claim.\n\n<Why>No.</Why>\n\n</Myth>`;
    const a = await parse(lesson({ body: `## H\n\nText.\n\n${QUIZ}\n\n${named}` }));
    const b = await parse(lesson({ body: `## Another heading\n\nOther text.\n\n${QUIZ}\n\n${named}` }));
    expect(a.steps[2]).toMatchObject({ kind: "myth", id: "my-myth" });
    expect(a.steps[1].kind === "quiz" && a.steps[1].id).toMatch(/^q[0-9a-z]+$/);
    // Editing a different step doesn't change a check's id.
    expect(a.steps.map((s) => (s.kind === "read" ? null : s.id))).toEqual(
      b.steps.map((s) => (s.kind === "read" ? null : s.id)),
    );

    expect(a.cards[0].id).toBe(b.cards[0].id);
  });

  const errors: [string, () => string, RegExp, string?][] = [
    [
      "a file name without a number",
      () => lesson(),
      /start with the lesson number/,
      "src/lessons/sample.mdx",
    ],
    ["bad frontmatter", () => lesson({ frontmatter: '---\nid: "x"\n---' }), /check the frontmatter: title/],
    ["an unknown track", () => lesson({ frontmatter: FRONTMATTER.replace('"Craft"', '"Cooking"') }), /track/],
    [
      "a quiz without options",
      () => lesson({ body: "<Quiz>\n\nQ?\n\n<Why>W</Why>\n\n</Quiz>" }),
      /list of options/,
    ],
    ["a quiz with two answers", () => lesson({ body: QUIZ.replace("- [ ] A", "- [x] A") }), /only have one/],
    ["a quiz with no answer", () => lesson({ body: QUIZ.replace("- [x] B", "- [ ] B") }), /mark the correct/],
    [
      "a quiz without a Why",
      () => lesson({ body: QUIZ.replace("<Why>Because.</Why>", "") }),
      /needs a <Why>/,
    ],
    [
      "a myth without a boolean fact",
      () => lesson({ body: "<Myth>\n\nC.\n\n<Why>W</Why>\n\n</Myth>" }),
      /fact=\{true\}/,
    ],
    ["a myth without a Why", () => lesson({ body: "<Myth fact={true}>\n\nC.\n\n</Myth>" }), /needs a <Why>/],
    [
      "an order without a numbered list",
      () => lesson({ body: "<Order>\n\nQ.\n\n- a\n- b\n- c\n\n<Why>W</Why>\n\n</Order>" }),
      /numbered list/,
    ],
    [
      "an order with two items",
      () => lesson({ body: "<Order>\n\nQ.\n\n1. a\n2. b\n\n<Why>W</Why>\n\n</Order>" }),
      /at least 3/,
    ],
    [
      "an order without a Why",
      () => lesson({ body: "<Order>\n\nQ.\n\n1. a\n2. b\n3. c\n\n</Order>" }),
      /needs a <Why>/,
    ],
    [
      "an interview without a rubric",
      () => lesson({ end: END.replace(/<Rubric>[\s\S]*<\/Rubric>/, "") }),
      /<Rubric> list and an <Answer>/,
    ],
    [
      "text after a check without a heading",
      () => lesson({ body: `${QUIZ}\n\nStray text.` }),
      /start with a `## heading`/,
    ],
    [
      "no interview",
      () => lesson({ end: END.replace(/<Interview>[\s\S]*<\/Interview>/, "") }),
      /add an <Interview>/,
    ],
    [
      "no cheat sheet",
      () => lesson({ end: END.replace(/<CheatSheet>[\s\S]*<\/CheatSheet>/, "") }),
      /add a <CheatSheet>/,
    ],
    ["no steps", () => lesson({ body: "" }), /at least one `## heading`/],
    [
      "a malformed check id",
      () => lesson({ body: QUIZ.replace("<Quiz>", '<Quiz id="Not OK">') }),
      /should start with a letter/,
    ],
    ["two identical checks", () => lesson({ body: `${QUIZ}\n\n${QUIZ}` }), /same text or id/],
    [
      "two cards with the same front",
      () => lesson({ frontmatter: FRONTMATTER.replace("Front two?", "Front one?") }),
      /same front/,
    ],
  ];

  test.each(errors)("%s is a readable LessonError", async (_name, source, message, file) => {
    const run = parse(source(), file);
    await expect(run).rejects.toThrow(LessonError);
    await expect(run).rejects.toThrow(message);
  });
});

test("lesson components never replace the plain tags parse-lesson looks for", () => {
  // parse-lesson.ts finds headings, lists, options and checkboxes by tag name.
  for (const tag of ["h2", "p", "ul", "ol", "li", "input"]) expect(mdxComponents).not.toHaveProperty(tag);
});
