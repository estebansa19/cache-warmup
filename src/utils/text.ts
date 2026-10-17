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
