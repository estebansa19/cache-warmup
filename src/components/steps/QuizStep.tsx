import { useState } from "react";
import type { QuizStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { shuffledIndexes } from "../../utils/shuffle";
import { Mark, Verdict } from "./Verdict";

type Props = { step: Step; seed: string; result?: CheckResult; onAnswer: (r: CheckResult) => void };

export function QuizStep({ step, seed, result, onAnswer }: Props) {
  // Options appear shuffled (the same way every time), so the answer isn't always in the same spot.
  const order = shuffledIndexes(step.options.length, seed);
  const [answeredNow, setAnsweredNow] = useState(false);

  return (
    <>
      <h2 className="eyebrow step-kind check">
        <i />
        Quick check
      </h2>
      <div className="question prose">{step.question}</div>
      <div className="options">
        {order.map((option, shown) => {
          const correct = option === step.answer;
          const chosen = option === result?.pick;
          const state = !result ? "" : correct ? "right" : chosen ? "wrong" : "dim";
          return (
            // aria-disabled instead of disabled: the button you pressed keeps focus until the verdict takes it.
            <button
              key={option}
              className={`option ${state}`}
              aria-disabled={Boolean(result)}
              onClick={() => {
                if (result) return;
                setAnsweredNow(true);
                onAnswer({ kind: "quiz", ok: correct, pick: option });
              }}
            >
              <span className="option-key" aria-hidden={result && (correct || chosen) ? true : undefined}>
                {result && (correct || chosen) ? (correct ? "✓" : "✗") : "ABCDEF"[shown]}
              </span>
              <span>
                {step.options[option]}
                {result && <Mark correct={correct} chosen={chosen} visible={false} />}
              </span>
            </button>
          );
        })}
      </div>
      {result && <Verdict ok={result.ok} why={step.why} focus={answeredNow} />}
    </>
  );
}
