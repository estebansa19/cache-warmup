import type { Progress } from "./progress";

/*
 * Prod: the idle game your XP pays for. You run a small service, and the number that goes up
 * is the requests it serves. XP buys its infrastructure (spending never lowers your level,
 * which counts every XP you've earned), each finished lesson unlocks one upgrade, and your
 * flashcards are its cache: a lesson that goes cold pages its upgrade offline.
 */

export type Prod = {
  /** Levels bought, by upgrade id: SERVERS, or the id of the lesson the upgrade belongs to. */
  owned: Record<string, number>;
  /** Requests served up to `at`. */
  served: number;
  /** When `served` was last counted (ms since the epoch); 0 until prod first boots. */
  at: number;
};

export const SERVERS = "servers";

/** A rack holds 42 units; the laptop under your desk is the first. */
export const MAX_SERVERS = 41;
export const MAX_LEVEL = 5;

/** What each level of a lesson's upgrade multiplies throughput by. */
export const BOOST = 1.3;

/** Throughput milestones, ten times apart. */
export const STAGES = [
  { rps: 0, name: "Laptop under the desk" },
  { rps: 10, name: "Side project" },
  { rps: 100, name: "Startup" },
  { rps: 1e3, name: "Series A" },
  { rps: 1e4, name: "Scale-up" },
  { rps: 1e5, name: "Household name" },
  { rps: 1e6, name: "Big tech" },
  { rps: 1e7, name: "Hyperscaler" },
  { rps: 1e8, name: "Planet-scale" },
  { rps: 1e9, name: "Interplanetary" },
] as const;

export function emptyProd(): Prod {
  return { owned: {}, served: 0, at: 0 };
}

export function maxLevel(id: string) {
  return id === SERVERS ? MAX_SERVERS : MAX_LEVEL;
}

/** The XP that buys level `level + 1`. Servers stay cheap but add little; upgrades multiply. */
export function upgradeCost(id: string, level: number) {
  return id === SERVERS ? Math.round(8 * 1.25 ** level) : Math.round(10 * 1.8 ** level);
}

/** XP you can still spend: everything earned minus every level bought. */
export function xpToSpend(progress: Progress) {
  let spent = 0;

  for (const [id, level] of Object.entries(progress.prod.owned)) {
    for (let l = 0; l < level; l++) spent += upgradeCost(id, l);
  }

  return Math.max(0, progress.xp - spent);
}

/** Servers are always for sale; a lesson's upgrade once you've finished the lesson. */
export function isUnlocked(progress: Progress, id: string) {
  return id === SERVERS || Boolean(progress.done[id]);
}

export function canBuy(progress: Progress, id: string) {
  const level = progress.prod.owned[id] ?? 0;

  return isUnlocked(progress, id) && level < maxLevel(id) && upgradeCost(id, level) <= xpToSpend(progress);
}

/** Your memory as prod sees it: lessons gone cold, and how warm your flashcards are (0 to 1). See prodHealth. */
export type Health = { cold: ReadonlySet<string>; warmth: number };

/** How many upgrades you own are offline because their lesson went cold. */
export function pagedCount(owned: Prod["owned"], { cold }: Health) {
  return [...cold].filter((id) => (owned[id] ?? 0) > 0).length;
}

/** Requests per second: (laptop + servers) × every running upgrade × the cache. */
export function throughput(owned: Prod["owned"], { cold, warmth }: Health) {
  const base = 1 + (owned[SERVERS] ?? 0);
  let boost = 1;

  for (const [id, level] of Object.entries(owned)) {
    if (id !== SERVERS && !cold.has(id)) boost *= BOOST ** level;
  }

  const cache = 1 + 2 * warmth;
  return { base, boost, cache, rps: base * boost * cache };
}

/**
 * Requests served by `now`, at `rps` since the last count. The game's simplification: the time
 * since your last visit counts at today's speed, so reviews you did meanwhile count for all of it.
 */
export function servedBy(prod: Prod, rps: number, now: number) {
  if (!prod.at || now <= prod.at) return prod.served;
  return prod.served + (rps * (now - prod.at)) / 1000;
}

/** Counts what was served so far and restarts the clock (the first call boots prod). */
export function bank(prod: Prod, rps: number, now: number): Prod {
  return { ...prod, served: servedBy(prod, rps, now), at: now };
}

export function stageInfo(rps: number) {
  let i = 0;
  while (i + 1 < STAGES.length && rps >= STAGES[i + 1].rps) i++;

  const current = STAGES[i];
  const next = STAGES[i + 1] ?? null;
  // Stages are ten times apart, so the way to the next one is measured in orders of magnitude.
  const percent = next
    ? Math.min(100, Math.max(0, Math.log10(Math.max(1, rps) / Math.max(1, current.rps)) * 100))
    : 100;
  return { name: current.name, next, percent };
}
