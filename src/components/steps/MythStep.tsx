import { useState } from "react";
import type { MythStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { Mark, Verdict } from "./Verdict";

type Props = { step: Step; result?: CheckResult; onAnswer: (r: CheckResult) => void };

export function MythStep({ step, result, onAnswer }: Props) {
  const [answeredNow, setAnsweredNow] = useState(false);
  const choice = (value: boolean, label: string) => {
    const correct = value === step.fact;
    const chosen = value === result?.pick;
    const state = !result ? "" : correct ? "right" : chosen ? "wrong" : "dim";
    return (
      <button
        className={`option centered ${state}`}
        aria-disabled={Boolean(result)}
        onClick={() => {
          if (result) return;
          setAnsweredNow(true);
          onAnswer({ kind: "myth", ok: correct, pick: value });
        }}
      >
        {result && <Mark correct={correct} chosen={chosen} />}
        {label}
      </button>
    );
  };

  return (
    <>
      <h2 className="eyebrow step-kind check">
        <i />
        Myth or fact?
      </h2>
      <div className="myth-claim prose">{step.claim}</div>
      <div className="myth-choices">
        {choice(true, "Fact")}
        {choice(false, "Myth")}
      </div>
      {result && (
        <Verdict
          ok={result.ok}
          why={step.why}
          lead={<b>{step.fact ? "Fact." : "Myth."}</b>}
          focus={answeredNow}
        />
      )}
    </>
  );
}
