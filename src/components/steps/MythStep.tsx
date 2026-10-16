import type { MythStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { Verdict } from "./Verdict";

type Props = { step: Step; result?: CheckResult; onAnswer: (r: CheckResult) => void };

export function MythStep({ step, result, onAnswer }: Props) {
  const choice = (value: boolean, label: string) => {
    const state = !result ? "" : value === step.fact ? "right" : value === result.pick ? "wrong" : "dim";
    return (
      <button
        className={`option centered ${state}`}
        disabled={Boolean(result)}
        onClick={() => onAnswer({ ok: value === step.fact, pick: value })}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <span className="eyebrow step-kind check">
        <i />
        Myth or fact?
      </span>
      <div className="myth-claim prose">{step.claim}</div>
      <div className="myth-choices">
        {choice(true, "Fact")}
        {choice(false, "Myth")}
      </div>
      {result && <Verdict ok={result.ok} why={step.why} lead={<b>{step.fact ? "Fact." : "Myth."}</b>} />}
    </>
  );
}
