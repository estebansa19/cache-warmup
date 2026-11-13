import { useEffect, useRef, useState, type CSSProperties } from "react";
import { lessons } from "../content/lessons";
import { textOf } from "../content/parse-lesson";
import type { CheckKind, CheckStep, Lesson } from "../content/types";
import { hrefFor } from "../router";
import { XP, levelInfo, streak } from "../state/levels";
import { useProgress } from "../state/ProgressContext";
import type { CheckResult } from "../state/progress";
import {
  cardKey,
  checkKey,
  lessonTemperature,
  lessonTrace,
  nextLesson,
  type Temperature,
  type TraceState,
} from "../state/selectors";
import { TIERS, isDue } from "../state/srs";
import { prettyDay, today, type Day } from "../utils/dates";
import { focusFirst } from "../utils/focus";
import { plural, twoDigits } from "../utils/text";
import { LevelBar } from "./LevelBar";
import { Check } from "./steps/Check";
import { TemperaturePill } from "./TemperaturePill";
import "./WarmupTrace.css";

/** What the trace needs to know about a lesson finished during this visit. */
export type JustFinished = { xpBefore: number };

const KINDS: Record<CheckKind, string> = {
  quiz: "Quick check",
  myth: "Myth or fact?",
  order: "Put it in order",
};

/** How each outcome reads in the trace, and the XP it earned. */
const OUTCOMES: Record<TraceState, { label: string; xp: number }> = {
  hit: { label: "hit", xp: XP.check },
  rewarmed: { label: "re-warmed", xp: XP.rewarm },
  miss: { label: "miss", xp: 0 },
  "missed-twice": { label: "miss ×2", xp: 0 },
  unanswered: { label: "skipped", xp: 0 },
};

const HEADLINES: Record<Temperature, string> = {
  hot: "Hot. This one lives near L1 now.",
  warm: "In cache, and warm.",
  cooling: "In cache, but starting to cool.",
  cold: "Gone cold. Its cards are waiting.",
};

type Props = { lesson: Lesson; justFinished: JustFinished | null };

/**
 * How a finished lesson went and where it stands, in the app's own terms: each check as a cache
 * hit or miss (a miss can be re-warmed once), its flashcards on their tiers, and its temperature.
 * Right after finishing it plays in, and shows what the lesson earned.
 */
export function WarmupTrace({ lesson, justFinished }: Props) {
  const { progress } = useProgress();
  const [rewarming, setRewarming] = useState<string | null>(null);
  const now = today();
  const trace = lessonTrace(lesson, progress);
  const { temperature, due } = lessonTemperature(lesson, progress, now);
  const upNext = nextLesson(lessons, progress);

  return (
    <section className={justFinished ? "trace fresh" : "trace"}>
      <span className="eyebrow step-kind recap">
        <i />
        Warm-up trace · lesson {twoDigits(lesson.n)}
      </span>
      <div className="trace-head">
        <h2>{HEADLINES[temperature]}</h2>
        <TemperaturePill lesson={lesson} />
      </div>
      <ol className="trace-lines">
        {trace.map(({ step, state }, i) => (
          <TraceLine
            key={step.id}
            lesson={lesson}
            step={step}
            state={state}
            index={i}
            // One at a time, so a keyboard answer can only land on one check.
            open={rewarming === step.id}
            onToggle={() => setRewarming(rewarming === step.id ? null : step.id)}
          />
        ))}
      </ol>
      <TraceStats lesson={lesson} states={trace.map((line) => line.state)} />
      <Shelf lesson={lesson} now={now} fresh={Boolean(justFinished)} />
      {justFinished && <Earned xpBefore={justFinished.xpBefore} />}
      <div className="row">
        {due > 0 && (
          <a className="btn" href={hrefFor({ view: "review" })}>
            Review {plural(due, "card")}
          </a>
        )}
        {upNext && (
          <a className="btn ghost" href={hrefFor({ view: "lesson", id: upNext.id })}>
            Next: lesson {upNext.n}
          </a>
        )}
        <a className="btn ghost" href={hrefFor({ view: "notes" })}>
          All cheat sheets
        </a>
      </div>
    </section>
  );
}

type TraceLineProps = {
  lesson: Lesson;
  step: CheckStep;
  state: TraceState;
  index: number;
  open: boolean;
  onToggle: () => void;
};

/** One check in the trace. A miss offers its retry, which opens under the line. */
function TraceLine({ lesson, step, state, index, open, onToggle }: TraceLineProps) {
  const outcome = OUTCOMES[state];

  return (
    <li className={`trace-line ${state}`} style={{ "--i": index } as CSSProperties}>
      <div className="trace-row">
        <span className="trace-index">check {index + 1}</span>
        <span className="trace-what">
          <b>{KINDS[step.kind]}</b> {textOf(step.kind === "myth" ? step.claim : step.question)}
        </span>
        <span className="trace-outcome">{outcome.label}</span>
        <span className="trace-earned">
          {outcome.xp > 0 && `+${outcome.xp} XP`}
          {(state === "miss" || open) && (
            <button className="btn ghost small" aria-expanded={open} onClick={onToggle}>
              {open ? "Hide" : "Re-warm"}
            </button>
          )}
        </span>
      </div>
      {open && <Rewarm lesson={lesson} step={step} />}
    </li>
  );
}

/** The one retry of a missed check, shuffled differently from the first time. */
function Rewarm({ lesson, step }: { lesson: Lesson; step: CheckStep }) {
  const { dispatch } = useProgress();
  const [retry, setRetry] = useState<CheckResult>();
  const box = useRef<HTMLDivElement>(null);
  const key = checkKey(lesson, step);

  // The button that opened this stays above it: take focus down to the question.
  useEffect(() => {
    focusFirst(box.current, "h2");
  }, []);

  function answer(result: CheckResult) {
    setRetry(result);
    dispatch({ type: "rewarm", key, ok: result.ok, today: today() });
  }

  return (
    <div className="trace-retry" ref={box}>
      <Check step={step} seed={`${key}:rewarm`} result={retry} onAnswer={answer} xp={XP.rewarm} />
    </div>
  );
}

function TraceStats({ lesson, states }: { lesson: Lesson; states: TraceState[] }) {
  const { progress } = useProgress();
  const hits = states.filter((state) => state === "hit").length;
  const rewarmed = states.filter((state) => state === "rewarmed").length;
  const ratio = states.length ? Math.round((hits / states.length) * 100) : 100;

  return (
    <div className="trace-stats">
      <Stat value={`${ratio}%`} label={rewarmed ? `hit ratio · ${rewarmed} re-warmed` : "hit ratio"} />
      <Stat value={progress.iv[lesson.id]?.xp ? "✓" : "–"} label="interview rep" />
      <Stat value={String(streak(progress.days, today()))} label="day streak" />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** The lesson's flashcards, each on the tier it sits in. */
function Shelf({ lesson, now, fresh }: { lesson: Lesson; now: Day; fresh: boolean }) {
  const { progress } = useProgress();
  const cards = lesson.cards.flatMap((card) => progress.cards[cardKey(lesson, card)] ?? []);
  const due = cards.filter((card) => isDue(card, now)).length;
  const nextDue = cards.map((card) => card.due).sort()[0];

  return (
    <div className="shelf">
      <p className="small-label">Its flashcards, by tier</p>
      <ul className="shelf-cards">
        {cards.map((card, i) => (
          <li key={i} className={`shelf-card tier-${card.box}`} style={{ "--i": i } as CSSProperties}>
            {TIERS[card.box]?.name}
          </li>
        ))}
      </ul>
      <p className="muted">{shelfNote(cards.length, due, nextDue, fresh, now)}</p>
    </div>
  );
}

/** Right after finishing: the XP the lesson added, and the new level if it crossed into one. */
function Earned({ xpBefore }: { xpBefore: number }) {
  const { progress } = useProgress();
  const level = levelInfo(progress.xp);
  const leveledUp = level.name !== levelInfo(xpBefore).name;

  return (
    <div className="earned">
      {leveledUp && (
        <p className="level-up">
          <mark>Level up: you're now {level.name}.</mark>
        </p>
      )}
      <LevelBar xp={progress.xp} gained={progress.xp - xpBefore} />
    </div>
  );
}

function shelfNote(total: number, due: number, nextDue: Day | undefined, fresh: boolean, now: Day) {
  if (fresh) return `${plural(total, "card")} written to Disk. The first review is tomorrow.`;
  if (due) return `${plural(due, "card")} due now. Reviewing them warms this lesson back up.`;
  return `Nothing due. Next review ${prettyDay(nextDue, now)}.`;
}
