import { useEffect, useRef, useState } from "react";
import { InterviewRep } from "../components/InterviewRep";
import { Check } from "../components/steps/Check";
import { HookStep } from "../components/steps/HookStep";
import { ReadStep } from "../components/steps/ReadStep";
import { RecapStep } from "../components/steps/RecapStep";
import type { JustFinished } from "../components/WarmupTrace";
import { isCheck, playerSteps, type Lesson, type PlayerStep } from "../content/types";
import { hrefFor } from "../router";
import { XP } from "../state/levels";
import { useProgress } from "../state/ProgressContext";
import type { CheckResult } from "../state/progress";
import { cardKey, checkKey, lessonScore, resultFor, traceState } from "../state/selectors";
import { today } from "../utils/dates";
import { focusFirst } from "../utils/focus";
import { useShortcuts } from "../utils/keys";
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
  const done = Boolean(progress.done[lesson.id]);
  const [justFinished, setJustFinished] = useState<JustFinished | null>(null);
  const sheet = useRef<HTMLElement>(null);
  const shownPos = useRef(pos);
  const wasDone = useRef(done);

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

  // Finishing replaces the button you pressed: take focus (and the view) to what it produced.
  useEffect(() => {
    if (done && !wasDone.current) {
      focusFirst(sheet.current, "h2");
      window.scrollTo(0, 0);
    }

    wasDone.current = done;
  }, [done]);

  // ← and → move between steps, and Enter goes forward like Next. Finishing stays a deliberate click.
  useShortcuts((key) => {
    if ((key === "ArrowRight" || key === "Enter") && !blocked && pos < last) go(pos + 1);
    if (key === "ArrowLeft" && pos > 0) go(pos - 1);
  });

  function go(to: number) {
    dispatch({ type: "move", lessonId: lesson.id, pos: clamp(to, last) });
    window.scrollTo(0, 0);
  }

  function answer(r: CheckResult) {
    if (isCheck(step)) dispatch({ type: "answer", key: checkKey(lesson, step), result: r, today: today() });
  }

  function finish() {
    const score = lessonScore(lesson, progress);

    setJustFinished({ xpBefore: progress.xp });
    dispatch({
      type: "finish",
      lessonId: lesson.id,
      correct: score.correct,
      total: score.total,
      cardKeys: lesson.cards.map((card) => cardKey(lesson, card)),
      today: today(),
    });
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
        {renderStep(step, { lesson, result, answer, justFinished })}
      </article>

      <div className="player-nav">
        <button className="btn ghost" onClick={() => go(pos - 1)} disabled={pos === 0}>
          Back
        </button>
        <span className="player-hint" id="player-hint">
          {hint}
        </span>
        <ForwardButton
          atEnd={pos === last}
          done={done}
          blocked={blocked}
          label={nextLabel(step, Boolean(progress.iv[lesson.id]?.draft))}
          describedBy={hint ? "player-hint" : undefined}
          onNext={() => go(pos + 1)}
          onFinish={finish}
        />
      </div>
    </div>
  );
}

type ForwardButtonProps = {
  atEnd: boolean;
  done: boolean;
  blocked: boolean;
  label: string;
  describedBy?: string;
  onNext: () => void;
  onFinish: () => void;
};

/** The one way forward: the next step, then finishing the lesson, then back to the path. */
function ForwardButton({ atEnd, done, blocked, label, describedBy, onNext, onFinish }: ForwardButtonProps) {
  if (!atEnd) {
    return (
      <button className="btn" onClick={onNext} disabled={blocked} aria-describedby={describedBy}>
        {label}
      </button>
    );
  }

  if (!done) {
    return (
      <button className="btn" onClick={onFinish}>
        Finish lesson · +{XP.lesson} XP
      </button>
    );
  }

  return (
    <a className="btn" href={hrefFor({ view: "home" })}>
      Back to the path
    </a>
  );
}

type StepContext = {
  lesson: Lesson;
  result: CheckResult | undefined;
  answer: (result: CheckResult) => void;
  justFinished: JustFinished | null;
};

function renderStep(step: PlayerStep, { lesson, result, answer, justFinished }: StepContext) {
  switch (step.kind) {
    case "hook":
      return <HookStep lesson={lesson} />;
    case "read":
      return <ReadStep step={step} />;
    case "quiz":
    case "myth":
    case "order":
      return <Check step={step} seed={checkKey(lesson, step)} result={result} onAnswer={answer} />;
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
      return <RecapStep lesson={lesson} justFinished={justFinished} />;
  }
}

/** The progress bar at the top: one segment per step, colored by what you did there. */
function StepSegments({ lesson, steps, pos }: { lesson: Lesson; steps: PlayerStep[]; pos: number }) {
  const { progress } = useProgress();
  const done = Boolean(progress.done[lesson.id]);

  function segmentClass(step: PlayerStep, i: number) {
    if (i === pos) return "current";

    const result = isCheck(step) ? resultFor(lesson, step, progress) : undefined;
    if (result) return traceState(result);
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
