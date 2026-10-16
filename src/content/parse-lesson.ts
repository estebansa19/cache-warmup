import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { MDXContent } from "mdx/types";
import { hash } from "../utils/shuffle";
import { describeIssues, frontmatterSchema } from "./frontmatter";
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
import type { CheckKind, ContentStep, Lesson, MythStep, OrderStep, QuizStep, ReadStep } from "./types";

export { TRACK_NAMES } from "./frontmatter";

/*
 * Turns one lesson MDX file into a Lesson.
 *
 * The MDX body is read top to bottom:
 *   - everything before the first step is the intro (the "hook")
 *   - each `## heading` starts a concept step, which runs until the next step
 *   - each <Quiz>, <Myth> or <Order> is a step of its own
 *   - <Interview> and <CheatSheet> close the lesson
 */

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
  return el.props.children;
};

const CHECK_ID = /^[a-z][a-z0-9-]*$/;

/** The id a check's answer is saved under: its `id` prop, or a hash of its text. */
function checkId(file: string, node: Element, kind: CheckKind, text: string): string {
  const id = node.props.id;
  if (id === undefined) return kind[0] + hash(`${kind}\n${text}`).toString(36);
  if (typeof id !== "string" || !CHECK_ID.test(id)) {
    throw new LessonError(file, `the id "${String(id)}" should start with a letter and use a-z, 0-9 and -`);
  }
  return id;
}

function parseQuiz(file: string, node: Element): QuizStep {
  const nodes = kids(node);
  const listAt = nodes.findIndex((n) => isElement(n, "ul"));
  if (listAt < 0)
    throw new LessonError(file, "a <Quiz> needs a list of options written as `- [ ]` / `- [x]`");
  const options: ReactNode[] = [];
  let answer = -1;
  kids(nodes[listAt]).forEach((li, i) => {
    // With blank lines between options, MDX wraps each one in a <p>; look inside it.
    const parts = kids(li).flatMap((part) => (isElement(part, "p") ? kids(part) : [part]));
    const box = parts.find((p) => isElement(p, "input"));
    if (box?.props.checked) {
      if (answer >= 0) throw new LessonError(file, "a <Quiz> can only have one `- [x]` option");
      answer = i;
    }
    options.push(parts.filter((p) => p !== box));
  });
  if (answer < 0) throw new LessonError(file, "mark the correct <Quiz> option with `- [x]`");
  const question = nodes.slice(0, listAt).filter((n) => !isElement(n, Why));
  return {
    kind: "quiz",
    id: checkId(file, node, "quiz", [question, ...options].map(textOf).join("\n")),
    question,
    options,
    answer,
    why: why(file, "Quiz", nodes),
  };
}

function parseMyth(file: string, node: Element): MythStep {
  const nodes = kids(node);
  const fact = node.props.fact;
  if (typeof fact !== "boolean")
    throw new LessonError(file, "write <Myth fact={true}> or <Myth fact={false}>");
  const claim = nodes.filter((n) => !isElement(n, Why));
  return {
    kind: "myth",
    id: checkId(file, node, "myth", textOf(claim)),
    claim,
    fact,
    why: why(file, "Myth", nodes),
  };
}

function parseOrder(file: string, node: Element): OrderStep {
  const nodes = kids(node);
  const listAt = nodes.findIndex((n) => isElement(n, "ol"));
  if (listAt < 0)
    throw new LessonError(file, "an <Order> needs a numbered list, written in the correct order");
  const items = kids(nodes[listAt]).map((li) => (isElement(li) ? li.props.children : li));
  if (items.length < 3) throw new LessonError(file, "an <Order> needs at least 3 items");
  const question = nodes.slice(0, listAt);
  const itemText = items.map(textOf);
  return {
    kind: "order",
    id: checkId(file, node, "order", [textOf(question), ...itemText].join("\n")),
    question,
    items,
    itemText,
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
    answer: answer.props.children,
  };
}

export type LessonModule = { default: MDXContent; frontmatter?: Record<string, unknown> };

export function parseLesson(file: string, mod: LessonModule): Lesson {
  const name = file.split("/").pop() ?? file;
  const n = Number(/^(\d+)-/.exec(name)?.[1]);
  if (!n) throw new LessonError(name, "file names start with the lesson number, like 15-observability.mdx");

  const meta = frontmatterSchema.safeParse(mod.frontmatter ?? {});
  if (!meta.success) {
    throw new LessonError(name, `check the frontmatter: ${describeIssues(meta.error.issues)}`);
  }

  // Calling the compiled MDX function gives us its top-level blocks without rendering anything.
  // This only works while MDXContent stays provider-free and wrapper-free: no
  // providerImportSource and no layout in the MDX options, so the result is the lesson's
  // own elements, with h2, p, ul, ol, li and input as plain tags.
  const root = mod.default({ components: mdxComponents }) as ReactNode;
  const hook: ReactNode[] = [];
  const steps: ContentStep[] = [];
  let open: ReadStep | null = null;
  let interview: Lesson["interview"] | null = null;
  let cheatSheet: ReactNode = null;

  const close = () => {
    if (open) steps.push(open);
    open = null;
  };

  for (const node of kids(root)) {
    if (isElement(node, "h2")) {
      close();
      const step: ReadStep = { kind: "read", title: textOf(node), body: [] };
      open = step;
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
      open.body.push(node);
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

  const checkIds = steps.flatMap((s) => (s.kind === "read" ? [] : [s.id]));
  if (new Set(checkIds).size < checkIds.length) {
    throw new LessonError(
      name,
      'two quick checks have the same text or id; give one an id, like <Quiz id="...">',
    );
  }

  const fm = meta.data;
  const cards = fm.cards.map(([front, back]) => ({ id: "c" + hash(front).toString(36), front, back }));
  if (new Set(cards.map((c) => c.id)).size < cards.length) {
    throw new LessonError(name, "two flashcards have the same front");
  }

  return {
    id: fm.id,
    n,
    title: fm.title,
    track: fm.track,
    mins: fm.mins,
    tag: fm.tag,
    cards,
    hook,
    steps,
    interview,
    cheatSheet,
  };
}
