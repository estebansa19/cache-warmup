import { useState } from "react";
import type { OrderStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { scrambledIndexes } from "../../utils/shuffle";
import { Verdict } from "./Verdict";

type Props = { step: Step; seed: string; result?: CheckResult; onAnswer: (r: CheckResult) => void };

export function OrderStep({ step, seed, result, onAnswer }: Props) {
  const [sequence, setSequence] = useState<number[]>([]);
  const header = (
    <>
      <span className="eyebrow step-kind check">
        <i />
        Put it in order
      </span>
      <div className="question prose">{step.question}</div>
    </>
  );

  if (result) {
    const yours = result.seq ?? [];
    const inPlace = yours.filter((item, i) => item === i).length;
    return (
      <>
        {header}
        <div>
          <p className="small-label">
            Your order · {inPlace}/{step.items.length} in place
          </p>
          <ul className="result-list">
            {yours.map((item, i) => (
              <li key={item}>
                <span className={item === i ? "mark ok" : "mark no"}>{item === i ? "✓" : "✗"}</span>
                <span>{step.items[item]}</span>
              </li>
            ))}
          </ul>
        </div>
        {!result.ok && (
          <div>
            <p className="small-label">Correct order</p>
            <ul className="result-list">
              {step.items.map((item, i) => (
                <li key={i}>
                  <span className="mark">{i + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Verdict ok={result.ok} why={step.why} />
      </>
    );
  }

  const pool = scrambledIndexes(step.items.length, seed).filter((i) => !sequence.includes(i));

  return (
    <>
      {header}
      <div className="order-area">
        <p className="small-label">Your sequence · tap an item to remove it</p>
        {sequence.length ? (
          <ol className="order-list">
            {sequence.map((item) => (
              <li key={item}>
                <button className="option" onClick={() => setSequence(sequence.filter((i) => i !== item))}>
                  <span>{step.items[item]}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="order-empty">Tap the steps below in the order they happen.</div>
        )}
        {pool.length > 0 && (
          <>
            <p className="small-label">Steps to place · {pool.length} left</p>
            <div className="options">
              {pool.map((item) => (
                <button key={item} className="option plain" onClick={() => setSequence([...sequence, item])}>
                  <span>{step.items[item]}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="row">
          <button
            className="btn"
            disabled={pool.length > 0}
            onClick={() => onAnswer({ ok: sequence.every((item, i) => item === i), seq: sequence })}
          >
            Check order
          </button>
          {sequence.length > 0 && (
            <button className="btn ghost small" onClick={() => setSequence([])}>
              Start over
            </button>
          )}
        </div>
      </div>
    </>
  );
}
