import { useState } from "react";
import type { MythStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { Mark, Verdict, optionState } from "./Verdict";

type Props = { step: Step; result?: CheckResult; onAnswer: (r: CheckResult) => void };

export function MythStep({ step, result, onAnswer }: Props) {
  const [answeredNow, setAnsweredNow] = useState(false);

  function pick(value: boolean) {
    if (result) return;

    setAnsweredNow(true);
    onAnswer({ kind: "myth", ok: value === step.fact, pick: value });
  }

  return (
    <>
      <h2 className="eyebrow step-kind check">
        <i />
        Myth or fact?
      </h2>
      <div className="myth-claim prose">{step.claim}</div>
      <div className="myth-choices">
        <MythChoice label="Fact" value={true} fact={step.fact} result={result} onPick={pick} />
        <MythChoice label="Myth" value={false} fact={step.fact} result={result} onPick={pick} />
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

type MythChoiceProps = {
  label: string;
  value: boolean;
  fact: boolean;
  result?: CheckResult;
  onPick: (value: boolean) => void;
};

function MythChoice({ label, value, fact, result, onPick }: MythChoiceProps) {
  const correct = value === fact;
  const chosen = value === result?.pick;

  return (
    <button
      className={`option centered ${optionState(Boolean(result), correct, chosen)}`}
      aria-disabled={Boolean(result)}
      onClick={() => onPick(value)}
    >
      {result && <Mark correct={correct} chosen={chosen} />}
      {label}
    </button>
  );
}
