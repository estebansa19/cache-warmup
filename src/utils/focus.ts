/**
 * Moves keyboard and screen reader focus to the first element matching `selector`
 * (usually a heading), so the next Tab continues from there instead of from the top.
 */
export function focusFirst(root: ParentNode | null | undefined, selector: string) {
  const target = root?.querySelector<HTMLElement>(selector);
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}
