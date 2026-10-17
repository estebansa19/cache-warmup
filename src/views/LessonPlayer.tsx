import { useEffect, useEffectEvent, useRef } from "react";
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
import { checkKey, resultFor } from "../state/selectors";
import { today } from "../utils/dates";
import { focusFirst } from "../utils/focus";
import "./LessonPlayer.css";

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const { progress, dispatch } = useProgress();
  const steps = playerSteps(lesson);
  const last = steps.length - 1;
  const pos = clamp(progress.pos[lesson.id] ?? 0, last);
  const step = steps[pos];
  const result = isCheck(step) ? resultFor(lesson, step, progress) : undefined;
  const blocked = isCheck(step) && !result;
  const hint = stepHint(step, blocked);
  const sheet = useRef<HTMLElement>(null);
  const shownPos = useRef(pos);

  // Remember this lesson for "continue" (and restart it if you finished it and left it on the last step).
  useEffect(() => {
    dispatch({ type: "open", lessonId: lesson.id, lastStep: last });
  }, [dispatch, lesson.id, last]);

  // A new step: take focus to its heading, so keyboard and screen reader users start reading there.
  useEffect(() => {
    if (shownPos.current === pos) return;

    shownPos.current = pos;
    focusFirst(sheet.current, "h2");
  }, [pos]);

  // ← and → move between steps, but not while typing or with a modifier (Alt+← is "back" in browsers).
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;

    if (e.key === "ArrowRight" && !blocked && pos < last) go(pos + 1);
    if (e.key === "ArrowLeft" && pos > 0) go(pos - 1);
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function go(to: number) {
    dispatch({ type: "move", lessonId: lesson.id, pos: clamp(to, last) });
    window.scrollTo(0, 0);
  }

  function answer(r: CheckResult) {
    if (isCheck(step)) dispatch({ type: "answer", key: checkKey(lesson, step), result: r, today: today() });
  }

  return (
    <div className="player">
      <div className="player-top">
        <a className="btn ghost small" href={hrefFor({ view: "home" })}>
          ← Path
        </a>
        <h1 className="player-title">{lesson.title}</h1>
        <span className="mono-note">
          Lesson {lesson.n} · step {pos + 1} of {steps.length}
        </span>
        <StepSegments lesson={lesson} steps={steps} pos={pos} />
      </div>

      {/* key: each step starts with fresh component state */}
      <article className="sheet" ref={sheet} key={pos}>
        {renderStep(step, { lesson, result, answer })}
      </article>

      <div className="player-nav">
        <button className="btn ghost" onClick={() => go(pos - 1)} disabled={pos === 0}>
          Back
        </button>
        <span className="player-hint" id="player-hint">
          {hint}
        </span>
        {pos === last ? (
          <a className="btn ghost" href={hrefFor({ view: "home" })}>
            Done
          </a>
        ) : (
          <button
            className="btn"
            onClick={() => go(pos + 1)}
            disabled={blocked}
            aria-describedby={hint ? "player-hint" : undefined}
          >
            {nextLabel(step, Boolean(progress.iv[lesson.id]?.draft))}
          </button>
        )}
      </div>
    </div>
  );
}

type StepContext = {
  lesson: Lesson;
  result: CheckResult | undefined;
  answer: (result: CheckResult) => void;
};

function renderStep(step: PlayerStep, { lesson, result, answer }: StepContext) {
  switch (step.kind) {
    case "hook":
      return <HookStep lesson={lesson} />;
    case "read":
      return <ReadStep step={step} />;
    case "quiz":
      return <QuizStep step={step} seed={checkKey(lesson, step)} result={result} onAnswer={answer} />;
    case "myth":
      return <MythStep step={step} result={result} onAnswer={answer} />;
    case "order":
      return <OrderStep step={step} seed={checkKey(lesson, step)} result={result} onAnswer={answer} />;
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

/** The progress bar at the top: one segment per step, colored by what you did there. */
function StepSegments({ lesson, steps, pos }: { lesson: Lesson; steps: PlayerStep[]; pos: number }) {
  const { progress } = useProgress();
  const done = Boolean(progress.done[lesson.id]);

  function segmentClass(step: PlayerStep, i: number) {
    if (i === pos) return "current";

    const result = isCheck(step) ? resultFor(lesson, step, progress) : undefined;
    if (result) return result.ok ? "ok" : "miss";
    return i < pos || done ? "seen" : "";
  }

  return (
    <div className="segments" aria-hidden="true">
      {steps.map((s, i) => (
        <i key={i} className={segmentClass(s, i)} />
      ))}
    </div>
  );
}

function nextLabel(step: PlayerStep, hasDraft: boolean) {
  if (step.kind === "hook") return "Let's go";
  if (step.kind === "interview") return hasDraft ? "Wrap up" : "Skip for now";
  return "Next";
}

function stepHint(step: PlayerStep, blocked: boolean) {
  if (blocked) return "Answer to continue";
  if (step.kind === "interview") return "Writing an answer is optional, but it's the best part";
  return "";
}

/** Keeps a step position between the first step and `last`. */
function clamp(pos: number, last: number) {
  return Math.min(last, Math.max(0, pos));
}
