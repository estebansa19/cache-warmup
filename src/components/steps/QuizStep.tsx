import type { QuizStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { shuffledIndexes } from "../../utils/shuffle";
import { Verdict } from "./Verdict";

type Props = { step: Step; seed: string; result?: CheckResult; onAnswer: (r: CheckResult) => void };

export function QuizStep({ step, seed, result, onAnswer }: Props) {
  // Options appear shuffled (the same way every time), so the answer isn't always in the same spot.
  const order = shuffledIndexes(step.options.length, seed);

  return (
    <>
      <span className="eyebrow step-kind check">
        <i />
        Quick check
      </span>
      <div className="question prose">{step.question}</div>
      <div className="options">
        {order.map((option, shown) => {
          const state = !result
            ? ""
            : option === step.answer
              ? "right"
              : option === result.pick
                ? "wrong"
                : "dim";
          return (
            <button
              key={option}
              className={`option ${state}`}
              disabled={Boolean(result)}
              onClick={() => onAnswer({ ok: option === step.answer, pick: option })}
            >
              <span className="option-key">{"ABCDEF"[shown]}</span>
              <span>{step.options[option]}</span>
            </button>
          );
        })}
      </div>
      {result && <Verdict ok={result.ok} why={step.why} />}
    </>
  );
}
