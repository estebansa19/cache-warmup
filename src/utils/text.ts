/** How many words `text` has. */
export function words(text: string | undefined): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

/** "1 card", "3 cards". */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** 5 → "05", for lesson numbers and dates. */
export function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** 16.5 → "16.5", 1234 → "1.2K", 3e9 → "3B". */
export function compact(n: number): string {
  return COMPACT.format(n);
}

/** A running total that's still readable: every digit up to the billions, then compact. */
export function bigCount(n: number): string {
  return n < 1e12 ? Math.floor(n).toLocaleString("en") : compact(n);
}
