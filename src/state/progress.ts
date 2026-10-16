import { XP } from "./levels";
import { newCard, reviewCard, type Card } from "./srs";
import type { Day } from "../utils/dates";
import { words } from "../utils/shuffle";

/*
 * Everything the app remembers about you, saved in localStorage.
 * The field names match version 1 of the app, so old exports still import.
 */

export type CheckResult = { ok: boolean; pick?: number | boolean; seq?: number[] };

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
  v: 1;
  xp: number;
  /** Finished lessons. */
  done: Record<string, { at: Day; correct: number; total: number }>;
  /** Current step per lesson. */
  pos: Record<string, number>;
  /** Answers to quick checks, keyed "lessonId:stepIndex". */
  checks: Record<string, CheckResult>;
  /** Interview answers and feedback, keyed by lesson id or extra question id. */
  iv: Record<string, InterviewState>;
  /** Flashcards, keyed "lessonId:cardIndex". */
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

export const emptyProgress = (): Progress => ({
  v: 1,
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
});

const isRecord = (x: unknown): x is Record<string, unknown> =>
  Boolean(x) && typeof x === "object" && !Array.isArray(x);

/** Accepts anything (stored data, an imported file) and returns valid progress, or null if it isn't progress. */
export function normalize(data: unknown): Progress | null {
  if (!isRecord(data) || data.v !== 1) return null;
  const p = emptyProgress();
  for (const key of ["done", "pos", "checks", "iv", "cards"] as const) {
    if (isRecord(data[key])) (p[key] as unknown) = data[key];
  }
  p.days = Array.isArray(data.days) ? data.days.filter((d): d is string => typeof d === "string") : [];
  p.xp = Number(data.xp) || 0;
  p.hits = Number(data.hits) || 0;
  p.misses = Number(data.misses) || 0;
  p.last = typeof data.last === "string" ? data.last : null;
  p.profile = typeof data.profile === "string" ? data.profile : "";
  return p;
}

export type Action =
  | { type: "open"; lessonId: string; restart: boolean }
  | { type: "move"; lessonId: string; pos: number }
  | { type: "answer"; key: string; result: CheckResult; today: Day }
  | { type: "finish"; lessonId: string; correct: number; total: number; cardCount: number; today: Day }
  | { type: "review"; cardKey: string; remembered: boolean; today: Day }
  | { type: "draft"; key: string; text: string }
  | { type: "feedback"; key: string; feedback: Feedback; today: Day }
  | { type: "revealAnswer"; key: string; today: Day }
  | { type: "profile"; text: string }
  | { type: "replace"; progress: Progress };

const markDay = (days: Day[], day: Day) => (days.includes(day) ? days : [...days, day].slice(-500));

export function reducer(state: Progress, action: Action): Progress {
  switch (action.type) {
    case "open":
      return {
        ...state,
        last: action.lessonId,
        pos: action.restart ? { ...state.pos, [action.lessonId]: 0 } : state.pos,
      };

    case "move":
      return { ...state, pos: { ...state.pos, [action.lessonId]: Math.max(0, action.pos) } };

    case "answer": {
      if (state.checks[action.key]) return state; // first answer counts
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
      for (let i = 0; i < action.cardCount; i++) {
        const key = `${action.lessonId}:${i}`;
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
      if (iv.xp || words(iv.draft) < 40) return state;
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

/* ---------- storage ---------- */

const STORAGE_KEY = "cache-warmup:v1";

export function loadProgress(): Progress {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")) ?? emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* storage full or blocked (private mode); progress lives for this visit only */
  }
}
