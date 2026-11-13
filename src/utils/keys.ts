import { useEffect, useEffectEvent } from "react";

/** Where a key press is text being typed. */
const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** Controls where Enter and Space already do something (press the button, follow the link). */
const CONTROLS = "button, a[href], summary, [role='button']";

/**
 * The key, when a page-wide keyboard shortcut may act on it. Null while typing, with a modifier
 * (those are the browser's, like Alt+← for "back"), on auto-repeat, and for Enter or Space on a
 * focused control, which keep their own job.
 */
export function shortcutKey(e: KeyboardEvent): string | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.defaultPrevented) return null;

  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest(TYPING)) return null;
  if ((e.key === "Enter" || e.key === " ") && target?.closest(CONTROLS)) return null;

  return e.key;
}

/** Calls `onKey` with each key press that may act as a shortcut (see shortcutKey), while `active`. */
export function useShortcuts(onKey: (key: string, e: KeyboardEvent) => void, active = true) {
  const handle = useEffectEvent((e: KeyboardEvent) => {
    const key = shortcutKey(e);
    if (key) onKey(key, e);
  });

  useEffect(() => {
    if (!active) return;

    const listener = (e: KeyboardEvent) => handle(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [active]);
}
