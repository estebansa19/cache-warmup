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

type MarkProps = { correct: boolean; chosen: boolean; visible?: boolean };

/** A ✓ or ✗ on an answered option (unless the option shows one already), with words for screen readers. */
export function Mark({ correct, chosen, visible = true }: MarkProps) {
  if (!correct && !chosen) return null;

  return (
    <>
      {visible && (
        <span className={`mark ${correct ? "ok" : "no"}`} aria-hidden="true">
          {correct ? "✓ " : "✗ "}
        </span>
      )}
      <span className="sr-only">{markLabel(correct, chosen)}</span>
    </>
  );
}

/** The CSS state of an answer option: "right", "wrong", "dim", or "" before answering. */
export function optionState(answered: boolean, correct: boolean, chosen: boolean) {
  if (!answered) return "";
  if (correct) return "right";
  return chosen ? "wrong" : "dim";
}

function markLabel(correct: boolean, chosen: boolean) {
  if (correct && chosen) return " (your answer, correct)";
  return correct ? " (correct answer)" : " (your answer, wrong)";
}
