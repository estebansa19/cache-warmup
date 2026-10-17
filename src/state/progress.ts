import type { CheckKind } from "../content/types";
import type { Day } from "../utils/dates";
import { words } from "../utils/text";
import { XP } from "./levels";
import { newCard, reviewCard, type Card } from "./srs";

/*
 * Everything the app remembers about you, saved in localStorage.
 *
 * Version 2 saves answers and flashcards under stable ids ("lessonId:checkId",
 * "lessonId:cardId"), so editing a lesson doesn't move your answers. Version 1
 * used positions ("lessonId:2"); those exports still import (see normalize.ts).
 *
 * Saved data is checked in normalize.ts and stored in storage.ts. This file has the
 * shape of progress and every change that can happen to it.
 */

/** The shortest draft that earns interview XP when compared with the strong answer. */
const MIN_WORDS_FOR_XP = 40;

export type CheckResult = { kind: CheckKind; ok: boolean; pick?: number | boolean; seq?: number[] };

export type Feedback = {
  score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  tip: string;
  followup: string;
};

export type InterviewState = { draft?: string; fb?: Feedback; fbAt?: Day; xp?: boolean };

export type Progress = {
  v: 2;
  xp: number;
  /** Finished lessons. */
  done: Record<string, { at: Day; correct: number; total: number }>;
  /** Current step per lesson. */
  pos: Record<string, number>;
  /** Answers to quick checks, keyed "lessonId:checkId". */
  checks: Record<string, CheckResult>;
  /** Interview answers and feedback, keyed by lesson id or extra question id. */
  iv: Record<string, InterviewState>;
  /** Flashcards, keyed "lessonId:cardId". */
  cards: Record<string, Card>;
  /** Days you did something, for the streak. */
  days: Day[];
  hits: number;
  misses: number;
  /** The lesson you were last in, for "continue". */
  last: string | null;
  /** "About you" note for the AI interviewer. */
  profile: string;
};

export function emptyProgress(): Progress {
  return {
    v: 2,
    xp: 0,
    done: {},
    pos: {},
    checks: {},
    iv: {},
    cards: {},
    days: [],
    hits: 0,
    misses: 0,
    last: null,
    profile: "",
  };
}

export type Action =
  | { type: "open"; lessonId: string; lastStep: number }
  | { type: "move"; lessonId: string; pos: number }
  | { type: "answer"; key: string; result: CheckResult; today: Day }
  | { type: "finish"; lessonId: string; correct: number; total: number; cardKeys: string[]; today: Day }
  | { type: "review"; cardKey: string; remembered: boolean; today: Day }
  | { type: "draft"; key: string; text: string }
  | { type: "feedback"; key: string; feedback: Feedback; today: Day }
  | { type: "revealAnswer"; key: string; today: Day }
  | { type: "profile"; text: string }
  | { type: "replace"; progress: Progress };

export function reducer(state: Progress, action: Action): Progress {
  switch (action.type) {
    case "open": {
      // Opening a finished lesson that you left on its last step starts it over.
      const restart =
        Boolean(state.done[action.lessonId]) && (state.pos[action.lessonId] ?? 0) >= action.lastStep;

      return {
        ...state,
        last: action.lessonId,
        pos: restart ? { ...state.pos, [action.lessonId]: 0 } : state.pos,
      };
    }

    case "move":
      return { ...state, pos: { ...state.pos, [action.lessonId]: Math.max(0, action.pos) } };

    case "answer": {
      if (state.checks[action.key]?.kind === action.result.kind) return state; // first answer counts

      return {
        ...state,
        checks: { ...state.checks, [action.key]: action.result },
        xp: state.xp + (action.result.ok ? XP.check : 0),
        days: markDay(state.days, action.today),
      };
    }

    case "finish": {
      if (state.done[action.lessonId]) return state;

      const cards = { ...state.cards };

      for (const key of action.cardKeys) {
        if (!cards[key]) cards[key] = newCard(action.today);
      }

      return {
        ...state,
        done: {
          ...state.done,
          [action.lessonId]: { at: action.today, correct: action.correct, total: action.total },
        },
        cards,
        xp: state.xp + XP.lesson,
        last: state.last === action.lessonId ? null : state.last,
        days: markDay(state.days, action.today),
      };
    }

    case "review": {
      const card = state.cards[action.cardKey];
      if (!card) return state;

      return {
        ...state,
        cards: { ...state.cards, [action.cardKey]: reviewCard(card, action.remembered, action.today) },
        hits: state.hits + (action.remembered ? 1 : 0),
        misses: state.misses + (action.remembered ? 0 : 1),
        xp: state.xp + XP.card,
        days: markDay(state.days, action.today),
      };
    }

    case "draft":
      return { ...state, iv: { ...state.iv, [action.key]: { ...state.iv[action.key], draft: action.text } } };

    case "feedback": {
      const iv = state.iv[action.key] ?? {};

      return {
        ...state,
        iv: { ...state.iv, [action.key]: { ...iv, fb: action.feedback, fbAt: action.today, xp: true } },
        xp: state.xp + (iv.xp ? 0 : XP.interview),
        days: markDay(state.days, action.today),
      };
    }

    case "revealAnswer": {
      // Comparing a real attempt with the strong answer earns the interview XP too.
      const iv = state.iv[action.key] ?? {};
      if (iv.xp || words(iv.draft) < MIN_WORDS_FOR_XP) return state;

      return {
        ...state,
        iv: { ...state.iv, [action.key]: { ...iv, xp: true } },
        xp: state.xp + XP.interview,
        days: markDay(state.days, action.today),
      };
    }

    case "profile":
      return { ...state, profile: action.text };

    case "replace":
      return action.progress;
  }
}

/** Adds `day` to the active days (for the streak), keeping the most recent 500. */
function markDay(days: Day[], day: Day): Day[] {
  return days.includes(day) ? days : [...days, day].slice(-500);
}
