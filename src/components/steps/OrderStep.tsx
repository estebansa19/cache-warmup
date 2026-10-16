import { useEffect, useRef, useState } from "react";
import type { OrderStep as Step } from "../../content/types";
import type { CheckResult } from "../../state/progress";
import { scrambledIndexes } from "../../utils/shuffle";
import { Verdict } from "./Verdict";

type Props = { step: Step; seed: string; result?: CheckResult; onAnswer: (r: CheckResult) => void };

/** Where focus goes after a tap removes the button you pressed: the button now in its place. */
type FocusNext = { list: "pool" | "sequence"; index: number } | null;

export function OrderStep({ step, seed, result, onAnswer }: Props) {
  const [sequence, setSequence] = useState<number[]>([]);
  const [focusNext, setFocusNext] = useState<FocusNext>(null);
  const [answeredNow, setAnsweredNow] = useState(false);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusNext || !area.current) return;
    const buttons = [
      ...area.current.querySelectorAll<HTMLButtonElement>(`[data-list="${focusNext.list}"] button`),
    ];
    const target =
      buttons[Math.min(focusNext.index, buttons.length - 1)] ??
      area.current.querySelector<HTMLButtonElement>(
        focusNext.list === "pool" ? ".check-order" : '[data-list="pool"] button',
      );
    target?.focus();
    setFocusNext(null);
  }, [focusNext]);

  const header = (
    <>
      <h2 className="eyebrow step-kind check">
        <i />
        Put it in order
      </h2>
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
                <span className={item === i ? "mark ok" : "mark no"} aria-hidden="true">
                  {item === i ? "✓" : "✗"}
                </span>
                <span>
                  {step.items[item]}
                  <span className="sr-only">{item === i ? " (in place)" : " (out of place)"}</span>
                </span>
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
        <Verdict ok={result.ok} why={step.why} focus={answeredNow} />
      </>
    );
  }

  const pool = scrambledIndexes(step.items.length, seed).filter((i) => !sequence.includes(i));
  const place = (item: number, index: number) => {
    setSequence([...sequence, item]);
    setFocusNext({ list: "pool", index });
  };
  const unplace = (item: number, index: number) => {
    setSequence(sequence.filter((i) => i !== item));
    setFocusNext(sequence.length > 1 ? { list: "sequence", index } : { list: "pool", index: 0 });
  };

  return (
    <>
      {header}
      <div className="order-area" ref={area}>
        <p className="small-label">Your sequence · tap an item to remove it</p>
        {sequence.length ? (
          <ol className="order-list" data-list="sequence">
            {sequence.map((item, i) => (
              <li key={item}>
                <button className="option" onClick={() => unplace(item, i)}>
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
            <div className="options" data-list="pool">
              {pool.map((item, i) => (
                <button key={item} className="option plain" onClick={() => place(item, i)}>
                  <span>{step.items[item]}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="row">
          <button
            className="btn check-order"
            disabled={pool.length > 0}
            onClick={() => {
              setAnsweredNow(true);
              onAnswer({ kind: "order", ok: sequence.every((item, i) => item === i), seq: sequence });
            }}
          >
            Check order
          </button>
          {sequence.length > 0 && (
            <button
              className="btn ghost small"
              onClick={() => {
                setSequence([]);
                setFocusNext({ list: "pool", index: 0 });
              }}
            >
              Start over
            </button>
          )}
        </div>
      </div>
    </>
  );
}
