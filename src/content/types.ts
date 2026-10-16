import type { ReactNode } from "react";

export const TRACKS = [
  { name: "Foundations", blurb: "How code grows and how it's shaped." },
  { name: "Data", blurb: "Where most production surprises come from." },
  { name: "Systems", blurb: "Jobs, networks, caches, and the space between services." },
  { name: "Craft", blurb: "Tests, security, and the story you tell about your work." },
] as const;

export type Track = (typeof TRACKS)[number]["name"];

/** A step that teaches: a `## heading` and everything under it. */
export type ReadStep = { kind: "read"; title: string; body: ReactNode[] };

/** Multiple choice. `answer` is the index of the option marked `- [x]`. */
export type QuizStep = {
  kind: "quiz";
  question: ReactNode[];
  options: ReactNode[];
  answer: number;
  why: ReactNode;
};

/** A statement to judge. `fact` is true when the statement is correct. */
export type MythStep = { kind: "myth"; claim: ReactNode[]; fact: boolean; why: ReactNode };

/** Items written in the correct order; the player shuffles them. */
export type OrderStep = {
  kind: "order";
  question: ReactNode[];
  items: ReactNode[];
  itemText: string[];
  why: ReactNode;
};

export type ContentStep = ReadStep | QuizStep | MythStep | OrderStep;
export type CheckStep = QuizStep | MythStep | OrderStep;

/** What the lesson player walks through: an intro, the lesson's steps, then the interview rep and the recap. */
export type PlayerStep = { kind: "hook" } | ContentStep | { kind: "interview" } | { kind: "recap" };

export type Interview = {
  /** Plain text, because it's also sent to the AI interviewer. */
  question: string;
  rubric: string[];
  answer: ReactNode;
};

export type Lesson = {
  id: string;
  /** Position on the path, taken from the file name (`05-indexes.mdx` → 5). */
  n: number;
  title: string;
  track: Track;
  mins: number;
  tag: string;
  hook: ReactNode[];
  steps: ContentStep[];
  interview: Interview;
  cheatSheet: ReactNode;
  cards: [front: string, back: string][];
};

export type ExtraQuestion = { id: string; topic: string; q: string };

export const isCheck = (step: PlayerStep): step is CheckStep =>
  step.kind === "quiz" || step.kind === "myth" || step.kind === "order";

export const playerSteps = (lesson: Lesson): PlayerStep[] => [
  { kind: "hook" },
  ...lesson.steps,
  { kind: "interview" },
  { kind: "recap" },
];
