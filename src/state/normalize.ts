import { z } from "zod/mini";
import type { CheckKind } from "../content/types";
import type { Day } from "../utils/dates";
import type { Progress } from "./progress";
import { clampTier } from "./srs";

/*
 * Reads saved or imported progress. Anything broken inside is dropped, and version 1
 * data is moved to version 2 keys, so an old or hand-edited file still loads.
 */

/**
 * How version 1 keys map to version 2, per lesson id:
 * `steps[i]` is the check at player step i (null for other steps), `cards[i]` the i-th card's key.
 */
export type LegacyKeys = Map<string, { steps: ({ key: string; kind: CheckKind } | null)[]; cards: string[] }>;

const day = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const count = z.int().check(z.nonnegative());
const text = z.string();

const feedbackSchema = z.object({
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
  box: z.pipe(z.int(), z.transform(clampTier)),
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

/** Keeps the entries of a record that pass `schema`, and drops the rest. */
function validEntries<T>(record: Record<string, unknown>, schema: z.ZodMiniType<T>): Record<string, T> {
  const out: Record<string, T> = {};

  for (const [key, value] of Object.entries(record)) {
    const parsed = z.safeParse(schema, value);
    if (parsed.success) out[key] = parsed.data;
  }

  return out;
}
