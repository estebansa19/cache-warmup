import type { ReactNode } from "react";
import { XP } from "../../state/levels";

/** The "Correct / Not quite" box shown after a quick check, with the explanation. */
export function Verdict({ ok, why, lead }: { ok: boolean; why: ReactNode; lead?: ReactNode }) {
  return (
    <div className={`verdict ${ok ? "ok" : "no"}`}>
      <strong>{ok ? `Correct · +${XP.check} XP` : "Not quite"}</strong>
      {lead}
      <div className="prose compact">{why}</div>
    </div>
  );
}
