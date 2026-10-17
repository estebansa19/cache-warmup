import { twoDigits } from "./text";

/** Dates are local calendar days as "YYYY-MM-DD", which compare correctly as strings. */
export type Day = string;

export function toDay(d: Date): Day {
  return `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
}

export function today(): Day {
  return toDay(new Date());
}

export function addDays(day: Day, n: number): Day {
  const [y, m, d] = day.split("-").map(Number);
  return toDay(new Date(y, m - 1, d + n));
}

/** "today", "tomorrow", or a short date like "Oct 21". */
export function prettyDay(day: Day | null | undefined, now: Day = today()): string {
  if (!day) return "";
  if (day === now) return "today";
  if (day === addDays(now, 1)) return "tomorrow";

  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
