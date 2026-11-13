import { useState } from "react";
import type { MythStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { useShortcuts } from "../../utils/keys";
import { Mark, Verdict, optionState } from "./Verdict";

/** The two answers, and the keys that pick each: its first letter or its place. */
const CHOICES = [
  { label: "Fact", value: true, keys: ["f", "1"] },
  { label: "Myth", value: false, keys: ["m", "2"] },
];

type Choice = (typeof CHOICES)[number];

type Props = { step: Step; result?: CheckResult; onAnswer: (r: CheckResult) => void; xp?: number };

export function MythStep({ step, result, onAnswer, xp }: Props) {
  const [answeredNow, setAnsweredNow] = useState(false);

  function pick(value: boolean) {
    if (result) return;

    setAnsweredNow(true);
    onAnswer({ kind: "myth", ok: value === step.fact, pick: value });
  }

  useShortcuts((key) => {
    const choice = CHOICES.find((c) => c.keys.includes(key.toLowerCase()));
    if (choice) pick(choice.value);
  }, !result);

  return (
    <>
      <h2 className="eyebrow step-kind check">
        <i />
        Myth or fact?
      </h2>
      <div className="myth-claim prose">{step.claim}</div>
      <div className="myth-choices">
        {CHOICES.map((choice) => (
          <MythChoice key={choice.label} choice={choice} fact={step.fact} result={result} onPick={pick} />
        ))}
      </div>
      {result && (
        <Verdict
          ok={result.ok}
          why={step.why}
          lead={<b>{step.fact ? "Fact." : "Myth."}</b>}
          focus={answeredNow}
          xp={xp}
        />
      )}
    </>
  );
}

type MythChoiceProps = {
  choice: Choice;
  fact: boolean;
  result?: CheckResult;
  onPick: (value: boolean) => void;
};

function MythChoice({ choice, fact, result, onPick }: MythChoiceProps) {
  const correct = choice.value === fact;
  const chosen = choice.value === result?.pick;

  return (
    <button
      className={`option centered ${optionState(Boolean(result), correct, chosen)}`}
      aria-disabled={Boolean(result)}
      aria-keyshortcuts={result ? undefined : choice.keys.join(" ").toUpperCase()}
      onClick={() => onPick(choice.value)}
    >
      {result && <Mark correct={correct} chosen={chosen} />}
      {choice.label}
    </button>
  );
}
