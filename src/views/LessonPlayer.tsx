import { useEffect } from "react";
import { InterviewRep } from "../components/InterviewRep";
import { HookStep } from "../components/steps/HookStep";
import { MythStep } from "../components/steps/MythStep";
import { OrderStep } from "../components/steps/OrderStep";
import { QuizStep } from "../components/steps/QuizStep";
import { ReadStep } from "../components/steps/ReadStep";
import { RecapStep } from "../components/steps/RecapStep";
import { isCheck, playerSteps, type Lesson, type PlayerStep } from "../content/types";
import { hrefFor } from "../router";
import { XP } from "../state/levels";
import { useProgress } from "../state/ProgressContext";
import type { CheckResult } from "../state/progress";
import { today } from "../utils/dates";
import "./LessonPlayer.css";

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const { progress, dispatch } = useProgress();
  const steps = playerSteps(lesson);
  const last = steps.length - 1;
  const pos = Math.min(last, Math.max(0, progress.pos[lesson.id] ?? 0));
  const step = steps[pos];
  const key = `${lesson.id}:${pos}`;
  const blocked = isCheck(step) && !progress.checks[key];

  // Opening a finished lesson that you left on its last step starts it over.
  useEffect(() => {
    const restart = Boolean(progress.done[lesson.id]) && (progress.pos[lesson.id] ?? 0) >= last;
    dispatch({ type: "open", lessonId: lesson.id, restart });
  }, [lesson.id]); // only when the lesson opens, not on every progress change

  const go = (to: number) => {
    dispatch({ type: "move", lessonId: lesson.id, pos: Math.min(last, Math.max(0, to)) });
    window.scrollTo(0, 0);
  };

  // ← and → move between steps (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, input")) return;
      if (e.key === "ArrowRight" && !blocked && pos < last) go(pos + 1);
      if (e.key === "ArrowLeft" && pos > 0) go(pos - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const answer = (result: CheckResult) => dispatch({ type: "answer", key, result, today: today() });
  const draft = progress.iv[lesson.id]?.draft;

  return (
    <div className="player">
      <div className="player-top">
        <a className="btn ghost small" href={hrefFor({ view: "home" })}>
          ← Path
        </a>
        <span className="mono-note">
          Lesson {lesson.n} · step {pos + 1} of {steps.length}
        </span>
        <div className="segments" aria-hidden="true">
          {steps.map((s, i) => (
            <i
              key={i}
              className={segmentClass(
                s,
                i,
                pos,
                progress.checks[`${lesson.id}:${i}`],
                progress.done[lesson.id],
              )}
            />
          ))}
        </div>
      </div>

      <article className="sheet" aria-live="polite">
        {renderStep(step, { lesson, stepKey: key, result: progress.checks[key], answer })}
      </article>

      <div className="player-nav">
        <button className="btn ghost" onClick={() => go(pos - 1)} disabled={pos === 0}>
          Back
        </button>
        <span className="player-hint">
          {blocked
            ? "Answer to continue"
            : step.kind === "interview"
              ? "Writing an answer is optional, but it's the best part"
              : ""}
        </span>
        {pos === last ? (
          <a className="btn ghost" href={hrefFor({ view: "home" })}>
            Done
          </a>
        ) : (
          <button className="btn" onClick={() => go(pos + 1)} disabled={blocked}>
            {step.kind === "hook"
              ? "Let's go"
              : step.kind === "interview"
                ? draft
                  ? "Wrap up"
                  : "Skip for now"
                : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}

type StepContext = {
  lesson: Lesson;
  stepKey: string;
  result: CheckResult | undefined;
  answer: (result: CheckResult) => void;
};

function renderStep(step: PlayerStep, { lesson, stepKey, result, answer }: StepContext) {
  switch (step.kind) {
    case "hook":
      return <HookStep lesson={lesson} />;
    case "read":
      return <ReadStep step={step} />;
    case "quiz":
      return <QuizStep step={step} seed={stepKey} result={result} onAnswer={answer} />;
    case "myth":
      return <MythStep step={step} result={result} onAnswer={answer} />;
    case "order":
      return <OrderStep key={stepKey} step={step} seed={stepKey} result={result} onAnswer={answer} />;
    case "interview":
      return (
        <>
          <span className="eyebrow step-kind interview">
            <i />
            Interview rep · +{XP.interview} XP
          </span>
          <InterviewRep id={lesson.id} question={lesson.interview} />
        </>
      );
    case "recap":
      return <RecapStep lesson={lesson} />;
  }
}

function segmentClass(
  step: PlayerStep,
  i: number,
  pos: number,
  result: CheckResult | undefined,
  done: unknown,
) {
  if (i === pos) return "current";
  if (isCheck(step) && result) return result.ok ? "ok" : "miss";
  return i < pos || done ? "seen" : "";
}
