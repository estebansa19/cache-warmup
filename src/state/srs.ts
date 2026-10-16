import { addDays, type Day } from "../utils/dates";

/*
 * Spaced repetition, Leitner style. Each card sits in a tier of the memory
 * hierarchy. Remembering it moves it one tier closer to the CPU, and the gap
 * before you see it again grows. Missing it sends it back to disk.
 */

export const TIERS = [
  { name: "Disk", days: 1, blurb: "New or missed. Back tomorrow." },
  { name: "RAM", days: 3, blurb: "Remembered once. Back in 3 days." },
  { name: "L2", days: 7, blurb: "Getting warm. Back in a week." },
  { name: "L1", days: 16, blurb: "Hot. Checked every ~2 weeks." },
] as const;

export type Card = { box: number; due: Day };

export const newCard = (now: Day): Card => ({ box: 0, due: addDays(now, TIERS[0].days) });

export function reviewCard(card: Card, remembered: boolean, now: Day): Card {
  if (!remembered) return { box: 0, due: addDays(now, TIERS[0].days) };
  const box = Math.min(TIERS.length - 1, card.box + 1);
  return { box, due: addDays(now, TIERS[box].days) };
}

export const isDue = (card: Card, now: Day) => card.due <= now;

/** Keys of due cards, oldest first, then lowest tier first. */
export function dueCardKeys(
  cards: Record<string, Card>,
  now: Day,
  exists: (key: string) => boolean = () => true,
) {
  return Object.entries(cards)
    .filter(([key, card]) => isDue(card, now) && exists(key))
    .sort(([, a], [, b]) => a.due.localeCompare(b.due) || a.box - b.box)
    .map(([key]) => key);
}

export function tierCounts(cards: Record<string, Card>): number[] {
  const counts = TIERS.map(() => 0);
  for (const card of Object.values(cards)) counts[Math.max(0, Math.min(TIERS.length - 1, card.box))]++;
  return counts;
}
