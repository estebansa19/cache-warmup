import type { ReactNode } from "react";
import { TRACK_NAMES } from "./frontmatter";

export type Track = (typeof TRACK_NAMES)[number];

const BLURBS: Record<Track, string> = {
  Foundations: "How code grows and how it's shaped.",
  Data: "Where most production surprises come from.",
  Systems: "Jobs, networks, caches, and the space between services.",
  Craft: "Tests, security, and the story you tell about your work.",
};

export const TRACKS = TRACK_NAMES.map((name) => ({ name, blurb: BLURBS[name] }));

/** A step that teaches: a `## heading` and everything under it. */
export type ReadStep = { kind: "read"; title: string; body: ReactNode[] };

/*
 * Quick checks have an `id` that progress is saved under: the `id` prop when the lesson sets
 * one (<Quiz id="...">), otherwise a hash of the check's text. Editing other steps, or moving
 * this one, keeps your answer.
 */

/** Multiple choice. `answer` is the index of the option marked `- [x]`. */
export type QuizStep = {
  kind: "quiz";
  id: string;
  question: ReactNode[];
  options: ReactNode[];
  answer: number;
  why: ReactNode;
};

/** A statement to judge. `fact` is true when the statement is correct. */
export type MythStep = { kind: "myth"; id: string; claim: ReactNode[]; fact: boolean; why: ReactNode };

/** Items written in the correct order; the player shuffles them. */
export type OrderStep = {
  kind: "order";
  id: string;
  question: ReactNode[];
  items: ReactNode[];
  itemText: string[];
  why: ReactNode;
};

export type ContentStep = ReadStep | QuizStep | MythStep | OrderStep;
export type CheckStep = QuizStep | MythStep | OrderStep;
export type CheckKind = CheckStep["kind"];

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
  /** Flashcards. `id` is a hash of the front, so reordering cards keeps their schedule. */
  cards: { id: string; front: string; back: string }[];
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
