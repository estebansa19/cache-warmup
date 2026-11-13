import { useState, type ReactNode } from "react";
import type { QuizStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { useShortcuts } from "../../utils/keys";
import { shuffledIndexes } from "../../utils/shuffle";
import { Mark, Verdict, optionState } from "./Verdict";

const OPTION_KEYS = "ABCDEF";

type Props = {
  step: Step;
  seed: string;
  result?: CheckResult;
  onAnswer: (r: CheckResult) => void;
  xp?: number;
};

export function QuizStep({ step, seed, result, onAnswer, xp }: Props) {
  // Options appear shuffled (the same way every time), so the answer isn't always in the same spot.
  const order = shuffledIndexes(step.options.length, seed);
  const [answeredNow, setAnsweredNow] = useState(false);

  function pick(option: number) {
    if (result) return;

    setAnsweredNow(true);
    onAnswer({ kind: "quiz", ok: option === step.answer, pick: option });
  }

  // The letter on an option, or its place as a number, picks it.
  useShortcuts((key) => {
    const shown = placeFor(key);
    if (shown >= 0 && shown < order.length) pick(order[shown]);
  }, !result);

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
            place={shown + 1}
            correct={option === step.answer}
            chosen={option === result?.pick}
            answered={Boolean(result)}
            onPick={() => pick(option)}
          />
        ))}
      </div>
      {result && <Verdict ok={result.ok} why={step.why} focus={answeredNow} xp={xp} />}
    </>
  );
}

type QuizOptionProps = {
  label: ReactNode;
  letter: string;
  place: number;
  correct: boolean;
  chosen: boolean;
  answered: boolean;
  onPick: () => void;
};

function QuizOption({ label, letter, place, correct, chosen, answered, onPick }: QuizOptionProps) {
  // Once answered, the letter becomes ✓ on the right option and ✗ on a wrong pick.
  const marked = answered && (correct || chosen);

  return (
    // aria-disabled instead of disabled: the button you pressed keeps focus until the verdict takes it.
    <button
      className={`option ${optionState(answered, correct, chosen)}`}
      aria-disabled={answered}
      aria-keyshortcuts={answered ? undefined : `${letter} ${place}`}
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

/** The option place a key names, A–F or 1–6, counting from 0. -1 for any other key. */
function placeFor(key: string) {
  const k = key.toLowerCase();
  if (k.length !== 1) return -1;

  const letter = OPTION_KEYS.toLowerCase().indexOf(k);
  return letter >= 0 ? letter : "123456".indexOf(k);
}
