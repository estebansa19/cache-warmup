import type { ComponentPropsWithoutRef, ReactNode } from "react";

/*
 * Components available inside lesson MDX files.
 *
 * Quiz, Myth, Order, Why, Interview, Rubric, Answer and CheatSheet are markers:
 * they never render by themselves. parse-lesson.ts finds them and turns them into
 * lesson steps. Note and table render as written.
 */

type Children = { children?: ReactNode };

export const Quiz = (_: Children) => null;
export const Myth = (_: Children & { fact: boolean }) => null;
export const Order = (_: Children) => null;
export const Why = (_: Children) => null;
export const Interview = (_: Children) => null;
export const Rubric = (_: Children) => null;
export const Answer = (_: Children) => null;
export const CheatSheet = (_: Children) => null;

/** A "From the field" aside: a real-world tip or analogy. */
export function Note({ children }: Children) {
  return (
    <aside className="note">
      <b className="note-label">From the field</b>
      {children}
    </aside>
  );
}

/** Wide tables scroll inside their own box instead of stretching the page. */
function Table(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="table-wrap">
      <table {...props} />
    </div>
  );
}

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
