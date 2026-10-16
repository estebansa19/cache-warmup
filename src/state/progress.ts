import { z } from "zod/mini";
import type { CheckKind } from "../content/types";
import type { Day } from "../utils/dates";
import { words } from "../utils/shuffle";
import { XP } from "./levels";
import { TIERS, newCard, reviewCard, type Card } from "./srs";

/*
 * Everything the app remembers about you, saved in localStorage.
 *
 * Version 2 saves answers and flashcards under stable ids ("lessonId:checkId",
 * "lessonId:cardId"), so editing a lesson doesn't move your answers. Version 1
 * used positions ("lessonId:2"); those exports still import (see migrateV1).
 */

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

export const emptyProgress = (): Progress => ({
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
});

/* ---------- reading saved or imported progress ---------- */

const day = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const count = z.int().check(z.nonnegative());
const text = z.string();

export const feedbackSchema = z.object({
  score: z.int().check(z.gte(1), z.lte(5)),
  verdict: text,
  strengths: z.array(text),
  gaps: z.array(text),
  tip: text,
  followup: text,
});

const checkSchema = z.object({
  kind: z.optional(z.enum(["quiz", "myth", "order"])),
  ok: z.boolean(),
  pick: z.optional(z.union([count, z.boolean()])),
  seq: z.optional(z.array(count)),
});

// A broken field is dropped and the rest of the entry kept.
const interviewSchema = z.object({
  draft: z.catch(z.optional(text), undefined),
  fb: z.catch(z.optional(feedbackSchema), undefined),
  fbAt: z.catch(z.optional(day), undefined),
  xp: z.catch(z.optional(z.boolean()), undefined),
});

const cardSchema = z.object({
  // Out-of-range tiers are clamped rather than dropped, so the card stays in your deck.
  box: z.pipe(
    z.int(),
    z.transform((box) => Math.max(0, Math.min(TIERS.length - 1, box))),
  ),
  due: day,
});

const doneSchema = z.object({ at: day, correct: count, total: count });

const progressSchema = z.object({
  v: z.union([z.literal(1), z.literal(2)]),
  xp: z.catch(count, 0),
  hits: z.catch(count, 0),
  misses: z.catch(count, 0),
  last: z.catch(z.nullable(text), null),
  profile: z.catch(text, ""),
  days: z.catch(z.array(z.unknown()), []),
  done: z.catch(z.record(z.string(), z.unknown()), {}),
  pos: z.catch(z.record(z.string(), z.unknown()), {}),
  checks: z.catch(z.record(z.string(), z.unknown()), {}),
  iv: z.catch(z.record(z.string(), z.unknown()), {}),
  cards: z.catch(z.record(z.string(), z.unknown()), {}),
});

/** Keeps the entries of a record that pass `schema`, and drops the rest. */
function validEntries<T>(record: Record<string, unknown>, schema: z.ZodMiniType<T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const parsed = z.safeParse(schema, value);
    if (parsed.success) out[key] = parsed.data;
  }
  return out;
}

/**
 * How version 1 keys map to version 2, per lesson id:
 * `steps[i]` is the check at player step i (null for other steps), `cards[i]` the i-th card's key.
 */
export type LegacyKeys = Map<string, { steps: ({ key: string; kind: CheckKind } | null)[]; cards: string[] }>;

/**
 * Accepts anything (stored data, an imported file) and returns valid progress, or null if it
 * isn't progress at all. Invalid entries (a broken card, a malformed answer) are dropped
 * instead of rejecting the whole file. Version 1 data is moved to version 2 keys.
 */
export function normalize(data: unknown, legacy: LegacyKeys): Progress | null {
  const parsed = z.safeParse(progressSchema, data);
  if (!parsed.success) return null;
  const d = parsed.data;
  const progress: Progress = {
    v: 2,
    xp: d.xp,
    hits: d.hits,
    misses: d.misses,
    last: d.last,
    profile: d.profile,
    days: d.days.filter((x): x is Day => z.safeParse(day, x).success),
    done: validEntries(d.done, doneSchema),
    pos: validEntries(d.pos, count),
    checks: {},
    iv: validEntries(d.iv, interviewSchema),
    cards: validEntries(d.cards, cardSchema),
  };
  const checks = validEntries(d.checks, checkSchema);
  if (d.v === 1) return migrateV1(progress, checks, legacy);
  for (const [key, result] of Object.entries(checks)) {
    if (result.kind) progress.checks[key] = { ...result, kind: result.kind };
  }
  return progress;
}

/** Moves "lessonId:index" keys to "lessonId:id". Entries that point nowhere are dropped. */
function migrateV1(
  progress: Progress,
  checks: Record<string, z.infer<typeof checkSchema>>,
  legacy: LegacyKeys,
): Progress {
  const position = (key: string) => {
    const at = key.lastIndexOf(":");
    return { lesson: legacy.get(key.slice(0, at)), index: Number(key.slice(at + 1)) };
  };
  const out: Progress = { ...progress, checks: {}, cards: {} };
  for (const [key, result] of Object.entries(checks)) {
    const { lesson, index } = position(key);
    const step = lesson?.steps[index];
    if (step) out.checks[step.key] = { ...result, kind: step.kind };
  }
  for (const [key, card] of Object.entries(progress.cards)) {
    const { lesson, index } = position(key);
    const cardKey = lesson?.cards[index];
    if (cardKey) out.cards[cardKey] = card;
  }
  return out;
}

/* ---------- changes ---------- */

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

const markDay = (days: Day[], day: Day) => (days.includes(day) ? days : [...days, day].slice(-500));

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

/** Unchanged since version 1, so existing progress is found and upgraded in place. */
export const STORAGE_KEY = "cache-warmup:v1";

/** Parses the stored (or another tab's) JSON. */
export function parseStored(json: string | null, legacy: LegacyKeys): Progress {
  try {
    return normalize(JSON.parse(json ?? "null"), legacy) ?? emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(legacy: LegacyKeys): Progress {
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY), legacy);
  } catch {
    return emptyProgress(); // storage blocked
  }
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* storage full or blocked (private mode); progress lives for this visit only */
  }
}
