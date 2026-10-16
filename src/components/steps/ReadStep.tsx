import type { ReadStep as Step } from "../../content/types";

export function ReadStep({ step }: { step: Step }) {
  return (
    <>
      <span className="eyebrow step-kind">
        <i />
        Concept
      </span>
      <h2>{step.title}</h2>
      <div className="prose">{step.body}</div>
    </>
  );
}
