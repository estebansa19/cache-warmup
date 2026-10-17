import type { ComponentPropsWithoutRef, ReactNode } from "react";

/*
 * Components available inside lesson MDX files.
 *
 * Quiz, Myth, Order, Why, Interview, Rubric, Answer and CheatSheet are markers:
 * they never render by themselves. parse-lesson.ts finds them and turns them into
 * lesson steps. Note and table render as written.
 *
 * Don't map plain Markdown tags (h2, p, ul, ol, li, input) to components here:
 * parse-lesson.ts looks for them by tag name. tests/parse-lesson.test.ts checks this.
 */

type Children = { children?: ReactNode };
/** `id` keeps saved answers attached when you reword a check. Optional. */
type Check = Children & { id?: string };

export const Quiz = (_: Check) => null;
export const Myth = (_: Check & { fact: boolean }) => null;
export const Order = (_: Check) => null;
export const Why = (_: Children) => null;
export const Interview = (_: Children) => null;
export const Rubric = (_: Children) => null;
export const Answer = (_: Children) => null;
export const CheatSheet = (_: Children) => null;

export const mdxComponents = {
  Quiz,
  Myth,
  Order,
  Why,
  Interview,
  Rubric,
  Answer,
  CheatSheet,
  Note,
  table: Table,
};

/** A "From the field" aside: a real-world tip or analogy. */
export function Note({ children }: Children) {
  return (
    <aside className="note">
      <b className="note-label">From the field</b>
      {children}
    </aside>
  );
}

/** Wide tables scroll inside their own box instead of stretching the page. Focusable, so keyboards can scroll it. */
function Table(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
      <table {...props} />
    </div>
  );
}
