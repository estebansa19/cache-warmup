import { useState, type ReactNode } from "react";
import type { QuizStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { shuffledIndexes } from "../../utils/shuffle";
import { Mark, Verdict, optionState } from "./Verdict";

const OPTION_KEYS = "ABCDEF";

type Props = { step: Step; seed: string; result?: CheckResult; onAnswer: (r: CheckResult) => void };

export function QuizStep({ step, seed, result, onAnswer }: Props) {
  // Options appear shuffled (the same way every time), so the answer isn't always in the same spot.
  const order = shuffledIndexes(step.options.length, seed);
  const [answeredNow, setAnsweredNow] = useState(false);

  function pick(option: number) {
    if (result) return;

    setAnsweredNow(true);
    onAnswer({ kind: "quiz", ok: option === step.answer, pick: option });
  }

  return (
    <>
      <h2 className="eyebrow step-kind check">
        <i />
        Quick check
      </h2>
      <div className="question prose">{step.question}</div>
      <div className="options">
        {order.map((option, shown) => (
          <QuizOption
            key={option}
            label={step.options[option]}
            letter={OPTION_KEYS[shown]}
            correct={option === step.answer}
            chosen={option === result?.pick}
            answered={Boolean(result)}
            onPick={() => pick(option)}
          />
        ))}
      </div>
      {result && <Verdict ok={result.ok} why={step.why} focus={answeredNow} />}
    </>
  );
}

type QuizOptionProps = {
  label: ReactNode;
  letter: string;
  correct: boolean;
  chosen: boolean;
  answered: boolean;
  onPick: () => void;
};

function QuizOption({ label, letter, correct, chosen, answered, onPick }: QuizOptionProps) {
  // Once answered, the letter becomes ✓ on the right option and ✗ on a wrong pick.
  const marked = answered && (correct || chosen);

  return (
    // aria-disabled instead of disabled: the button you pressed keeps focus until the verdict takes it.
    <button
      className={`option ${optionState(answered, correct, chosen)}`}
      aria-disabled={answered}
      onClick={onPick}
    >
      <span className="option-key" aria-hidden={marked || undefined}>
        {marked ? (correct ? "✓" : "✗") : letter}
      </span>
      <span>
        {label}
        {answered && <Mark correct={correct} chosen={chosen} visible={false} />}
      </span>
    </button>
  );
}
