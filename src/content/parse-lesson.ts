import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { MDXContent } from "mdx/types";
import { z } from "zod";
import {
  Answer,
  CheatSheet,
  Interview,
  Myth,
  Order,
  Quiz,
  Rubric,
  Why,
  mdxComponents,
} from "./mdx-components";
import { TRACKS, type ContentStep, type Lesson, type MythStep, type OrderStep, type QuizStep } from "./types";

/*
 * Turns one lesson MDX file into a Lesson.
 *
 * The MDX body is read top to bottom:
 *   - everything before the first step is the intro (the "hook")
 *   - each `## heading` starts a concept step, which runs until the next step
 *   - each <Quiz>, <Myth> or <Order> is a step of its own
 *   - <Interview> and <CheatSheet> close the lesson
 */

const frontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "use lowercase letters, digits and dashes"),
  title: z.string().min(1),
  track: z.enum(TRACKS.map((t) => t.name) as [string, ...string[]]),
  mins: z.number().int().positive(),
  tag: z.string().min(1),
  cards: z.array(z.tuple([z.string().min(1), z.string().min(1)])).min(1),
});

export class LessonError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "LessonError";
  }
}

type Element = ReactElement<{ children?: ReactNode; [prop: string]: unknown }>;

const isElement = (node: ReactNode, type?: unknown): node is Element =>
  isValidElement(node) && (type === undefined || node.type === type);

/** Child nodes without the whitespace-only strings MDX puts between blocks. */
const kids = (node: ReactNode): ReactNode[] =>
  Children.toArray(isElement(node) ? node.props.children : node).filter(
    (c) => !(typeof c === "string" && !c.trim()),
  );

/** Plain text of a node tree, e.g. for the rubric that goes to the AI. */
export const textOf = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isElement(node)) return textOf(node.props.children);
  return "";
};

const why = (file: string, step: string, nodes: ReactNode[]) => {
  const el = nodes.find((n) => isElement(n, Why));
  if (!el) throw new LessonError(file, `every <${step}> needs a <Why> explaining the answer`);
  return (el as Element).props.children;
};

function parseQuiz(file: string, node: Element): QuizStep {
  const nodes = kids(node);
  const listAt = nodes.findIndex((n) => isElement(n, "ul"));
  if (listAt < 0)
    throw new LessonError(file, "a <Quiz> needs a list of options written as `- [ ]` / `- [x]`");
  const options: ReactNode[] = [];
  let answer = -1;
  kids(nodes[listAt]).forEach((li, i) => {
    const parts = kids(li);
    const box = parts.find((p) => isElement(p, "input"));
    if (box && (box as Element).props.checked) {
      if (answer >= 0) throw new LessonError(file, "a <Quiz> can only have one `- [x]` option");
      answer = i;
    }
    options.push(parts.filter((p) => p !== box));
  });
  if (answer < 0) throw new LessonError(file, "mark the correct <Quiz> option with `- [x]`");
  return {
    kind: "quiz",
    question: nodes.slice(0, listAt).filter((n) => !isElement(n, Why)),
    options,
    answer,
    why: why(file, "Quiz", nodes),
  };
}

function parseMyth(file: string, node: Element): MythStep {
  const nodes = kids(node);
  if (typeof node.props.fact !== "boolean")
    throw new LessonError(file, "write <Myth fact={true}> or <Myth fact={false}>");
  return {
    kind: "myth",
    claim: nodes.filter((n) => !isElement(n, Why)),
    fact: node.props.fact,
    why: why(file, "Myth", nodes),
  };
}

function parseOrder(file: string, node: Element): OrderStep {
  const nodes = kids(node);
  const listAt = nodes.findIndex((n) => isElement(n, "ol"));
  if (listAt < 0)
    throw new LessonError(file, "an <Order> needs a numbered list, written in the correct order");
  const items = kids(nodes[listAt]).map((li) => (li as Element).props.children);
  if (items.length < 3) throw new LessonError(file, "an <Order> needs at least 3 items");
  return {
    kind: "order",
    question: nodes.slice(0, listAt),
    items,
    itemText: items.map(textOf),
    why: why(file, "Order", nodes),
  };
}

function parseInterview(file: string, node: Element) {
  const nodes = kids(node);
  const rubric = nodes.find((n) => isElement(n, Rubric));
  const answer = nodes.find((n) => isElement(n, Answer));
  if (!rubric || !answer) throw new LessonError(file, "an <Interview> needs a <Rubric> list and an <Answer>");
  const question = nodes
    .filter((n) => n !== rubric && n !== answer)
    .map(textOf)
    .join(" ")
    .trim();
  return {
    question,
    rubric: kids(rubric)
      .flatMap((list) => kids(list))
      .map(textOf)
      .map((s) => s.trim())
      .filter(Boolean),
    answer: (answer as Element).props.children,
  };
}

export type LessonModule = { default: MDXContent; frontmatter?: Record<string, unknown> };

export function parseLesson(file: string, mod: LessonModule): Lesson {
  const name = file.split("/").pop() ?? file;
  const n = Number(/^(\d+)-/.exec(name)?.[1]);
  if (!n) throw new LessonError(name, "file names start with the lesson number, like 15-observability.mdx");

  const meta = frontmatterSchema.safeParse(mod.frontmatter ?? {});
  if (!meta.success) {
    const issues = meta.error.issues
      .map((i) => `${i.path.join(".") || "frontmatter"} (${i.message})`)
      .join(", ");
    throw new LessonError(name, `check the frontmatter: ${issues}`);
  }

  // Calling the compiled MDX function gives us its top-level blocks without rendering anything.
  const root = mod.default({ components: mdxComponents }) as ReactNode;
  const hook: ReactNode[] = [];
  const steps: ContentStep[] = [];
  let open: Extract<ContentStep, { kind: "read" }> | null = null;
  let interview: Lesson["interview"] | null = null;
  let cheatSheet: ReactNode = null;

  const close = () => {
    if (open) steps.push(open);
    open = null;
  };

  for (const node of kids(root)) {
    if (isElement(node, "h2")) {
      close();
      open = { kind: "read", title: textOf(node), body: [] };
    } else if (isElement(node, Quiz)) {
      close();
      steps.push(parseQuiz(name, node));
    } else if (isElement(node, Myth)) {
      close();
      steps.push(parseMyth(name, node));
    } else if (isElement(node, Order)) {
      close();
      steps.push(parseOrder(name, node));
    } else if (isElement(node, Interview)) {
      close();
      interview = parseInterview(name, node);
    } else if (isElement(node, CheatSheet)) {
      close();
      cheatSheet = node.props.children;
    } else if (open) {
      (open as { body: ReactNode[] }).body.push(node);
    } else if (steps.length === 0) {
      hook.push(node);
    } else {
      throw new LessonError(name, "text after a quiz needs to start with a `## heading`");
    }
  }
  close();

  if (!interview) throw new LessonError(name, "add an <Interview> block at the end");
  if (!cheatSheet) throw new LessonError(name, "add a <CheatSheet> block at the end");
  if (!steps.length) throw new LessonError(name, "a lesson needs at least one `## heading` step");

  const fm = meta.data;
  return {
    id: fm.id,
    n,
    title: fm.title,
    track: fm.track as Lesson["track"],
    mins: fm.mins,
    tag: fm.tag,
    cards: fm.cards,
    hook,
    steps,
    interview,
    cheatSheet,
  };
}
