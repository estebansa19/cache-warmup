import { useEffect, useRef, type ReactNode } from "react";
import { XP } from "../../state/levels";

type Props = { ok: boolean; why: ReactNode; lead?: ReactNode; focus?: boolean };

/**
 * The "Correct / Not quite" box shown after a quick check, with the explanation.
 * `focus` moves focus here, for when it appears because you just answered.
 */
export function Verdict({ ok, why, lead, focus }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) box.current?.focus();
  }, [focus]);
  return (
    <div className={`verdict ${ok ? "ok" : "no"}`} ref={box} tabIndex={-1}>
      <strong>{ok ? `Correct · +${XP.check} XP` : "Not quite"}</strong>
      {lead}
      <div className="prose compact">{why}</div>
    </div>
  );
}

/** A ✓ or ✗ on an answered option (unless the option shows one already), with words for screen readers. */
export function Mark({
  correct,
  chosen,
  visible = true,
}: {
  correct: boolean;
  chosen: boolean;
  visible?: boolean;
}) {
  if (!correct && !chosen) return null;
  return (
    <>
      {visible && (
        <span className={`mark ${correct ? "ok" : "no"}`} aria-hidden="true">
          {correct ? "✓ " : "✗ "}
        </span>
      )}
      <span className="sr-only">
        {correct && chosen
          ? " (your answer, correct)"
          : correct
            ? " (correct answer)"
            : " (your answer, wrong)"}
      </span>
    </>
  );
}
