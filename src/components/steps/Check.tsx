import type { CheckStep } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { MythStep } from "./MythStep";
import { OrderStep } from "./OrderStep";
import { QuizStep } from "./QuizStep";

type Props = {
  step: CheckStep;
  /** Fixes the order the options or items are shown in. */
  seed: string;
  result?: CheckResult;
  onAnswer: (r: CheckResult) => void;
  /** What a right answer earns, when it isn't the usual amount. */
  xp?: number;
};

/** A quick check of any kind. */
export function Check({ step, seed, result, onAnswer, xp }: Props) {
  switch (step.kind) {
    case "quiz":
      return <QuizStep step={step} seed={seed} result={result} onAnswer={onAnswer} xp={xp} />;
    case "myth":
      return <MythStep step={step} result={result} onAnswer={onAnswer} xp={xp} />;
    case "order":
      return <OrderStep step={step} seed={seed} result={result} onAnswer={onAnswer} xp={xp} />;
  }
}
