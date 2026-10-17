import { addDays, type Day } from "../utils/dates";

export const XP = { check: 10, lesson: 30, interview: 25, card: 2 } as const;

export const LEVELS = [
  { xp: 0, name: "Intern" },
  { xp: 150, name: "Junior" },
  { xp: 400, name: "Mid-level" },
  { xp: 800, name: "Senior" },
  { xp: 1300, name: "Staff" },
  { xp: 2000, name: "Principal" },
  { xp: 3000, name: "Distinguished" },
] as const;

export function levelInfo(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;

  const current = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const percent = next ? Math.min(100, ((xp - current.xp) / (next.xp - current.xp)) * 100) : 100;
  return { name: current.name, next, percent };
}

/** Consecutive active days ending today (or yesterday, so the streak survives until you study today). */
export function streak(days: Day[], now: Day): number {
  const active = new Set(days);
  let day = active.has(now) ? now : addDays(now, -1);
  let count = 0;

  while (active.has(day)) {
    count++;
    day = addDays(day, -1);
  }

  return count;
}
