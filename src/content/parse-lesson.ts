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

/*
 * Turns one lesson MDX file into a Lesson.
 *
 * The MDX body is read top to bottom:
 *   - everything before the first step is the intro (the "hook")
 *   - each `## heading` starts a concept step, which runs until the next step
 *   - each <Quiz>, <Myth> or <Order> is a step of its own
 *   - <Interview> and <CheatSheet> close the lesson
 */

const CHECK_ID = /^[a-z][a-z0-9-]*$/;

export type LessonModule = { default: MDXContent; frontmatter?: Record<string, unknown> };

type Element = ReactElement<{ children?: ReactNode; [prop: string]: unknown }>;

type Body = {
  hook: ReactNode[];
  steps: ContentStep[];
  interview: Lesson["interview"];
  cheatSheet: ReactNode;
};

export class LessonError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "LessonError";
  }
}

function isElement(node: ReactNode, type?: unknown): node is Element {
  return isValidElement(node) && (type === undefined || node.type === type);
}

/** Child nodes without the whitespace-only strings MDX puts between blocks. */
function kids(node: ReactNode): ReactNode[] {
  return Children.toArray(isElement(node) ? node.props.children : node).filter(
    (c) => !(typeof c === "string" && !c.trim()),
  );
}

/** Plain text of a node tree, e.g. for the rubric that goes to the AI. */
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isElement(node)) return textOf(node.props.children);
  return "";
}

/** The explanation inside a check's <Why>. */
function whyOf(file: string, step: string, nodes: ReactNode[]) {
  const el = nodes.find((n) => isElement(n, Why));
  if (!el) throw new LessonError(file, `every <${step}> needs a <Why> explaining the answer`);
  return el.props.children;
}

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

  if (listAt < 0) {
    throw new LessonError(file, "a <Quiz> needs a list of options written as `- [ ]` / `- [x]`");
  }

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
    why: whyOf(file, "Quiz", nodes),
  };
}

function parseMyth(file: string, node: Element): MythStep {
  const nodes = kids(node);
  const fact = node.props.fact;

  if (typeof fact !== "boolean") {
    throw new LessonError(file, "write <Myth fact={true}> or <Myth fact={false}>");
  }

  const claim = nodes.filter((n) => !isElement(n, Why));

  return {
    kind: "myth",
    id: checkId(file, node, "myth", textOf(claim)),
    claim,
    fact,
    why: whyOf(file, "Myth", nodes),
  };
}

function parseOrder(file: string, node: Element): OrderStep {
  const nodes = kids(node);
  const listAt = nodes.findIndex((n) => isElement(n, "ol"));

  if (listAt < 0) {
    throw new LessonError(file, "an <Order> needs a numbered list, written in the correct order");
  }

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
    why: whyOf(file, "Order", nodes),
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

export function parseLesson(file: string, mod: LessonModule): Lesson {
  const name = file.split("/").pop() ?? file;
  const n = Number(/^(\d+)-/.exec(name)?.[1]);
  if (!n) throw new LessonError(name, "file names start with the lesson number, like 15-observability.mdx");

  const meta = frontmatterSchema.safeParse(mod.frontmatter ?? {});

  if (!meta.success) {
    throw new LessonError(name, `check the frontmatter: ${describeIssues(meta.error.issues)}`);
  }

  const body = parseBody(name, mod);
  const { id, title, track, mins, tag, cards } = meta.data;
  return { id, n, title, track, mins, tag, cards: parseCards(name, cards), ...body };
}

/** Walks the MDX body top to bottom and sorts its blocks into the hook, steps, interview and cheat sheet. */
function parseBody(name: string, mod: LessonModule): Body {
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

  // Each of these starts a new block, which ends the concept step before it.
  const startBlock = new Map<unknown, (node: Element) => void>([
    ["h2", (node) => (open = { kind: "read", title: textOf(node), body: [] })],
    [Quiz, (node) => steps.push(parseQuiz(name, node))],
    [Myth, (node) => steps.push(parseMyth(name, node))],
    [Order, (node) => steps.push(parseOrder(name, node))],
    [Interview, (node) => (interview = parseInterview(name, node))],
    [CheatSheet, (node) => (cheatSheet = node.props.children)],
  ]);

  // Anything else belongs to the concept step being read, or to the hook before the first step.
  const addContent = (node: ReactNode) => {
    if (open) open.body.push(node);
    else if (steps.length === 0) hook.push(node);
    else throw new LessonError(name, "text after a quiz needs to start with a `## heading`");
  };

  const closeStep = () => {
    if (open) steps.push(open);
    open = null;
  };

  for (const node of kids(root)) {
    const start = isElement(node) ? startBlock.get(node.type) : undefined;

    if (!start) {
      addContent(node);
      continue;
    }

    closeStep();
    start(node as Element);
  }

  closeStep();

  if (!interview) throw new LessonError(name, "add an <Interview> block at the end");
  if (!cheatSheet) throw new LessonError(name, "add a <CheatSheet> block at the end");
  if (!steps.length) throw new LessonError(name, "a lesson needs at least one `## heading` step");

  assertUniqueCheckIds(name, steps);
  return { hook, steps, interview, cheatSheet };
}

function assertUniqueCheckIds(name: string, steps: ContentStep[]) {
  const checkIds = steps.flatMap((s) => (s.kind === "read" ? [] : [s.id]));

  if (new Set(checkIds).size < checkIds.length) {
    throw new LessonError(
      name,
      'two quick checks have the same text or id; give one an id, like <Quiz id="...">',
    );
  }
}

/** Flashcards from the frontmatter, each with an id that's a hash of its front. */
function parseCards(name: string, cards: [string, string][]): Lesson["cards"] {
  const parsed = cards.map(([front, back]) => ({ id: "c" + hash(front).toString(36), front, back }));

  if (new Set(parsed.map((c) => c.id)).size < parsed.length) {
    throw new LessonError(name, "two flashcards have the same front");
  }

  return parsed;
}
