import { LevelBar } from "../components/LevelBar";
import { TemperaturePill } from "../components/TemperaturePill";
import { isKnownCard, lessons } from "../content/lessons";
import { TRACKS, playerSteps, type Lesson } from "../content/types";
import { hrefFor } from "../router";
import { streak } from "../state/levels";
import { useProgress } from "../state/ProgressContext";
import { SERVERS, canBuy, pagedCount, stageInfo, throughput, xpToSpend } from "../state/prod";
import { lessonStatus, nextLesson, prodHealth } from "../state/selectors";
import { TIERS, dueCardKeys, nextDueDay, tierCounts } from "../state/srs";
import type { Progress } from "../state/progress";
import { prettyDay, today, type Day } from "../utils/dates";
import { compact, plural, twoDigits } from "../utils/text";
import "./Home.css";

export function Home() {
  const { progress } = useProgress();

  return (
    <>
      {/* What to do next comes first, so on a phone it's on screen without scrolling past the stats. */}
      <section className="hero">
        <div className="hero-main">
          <div>
            <p className="eyebrow">Fundamentals refresh · {lessons.length} lessons · a few at a time</p>
            <h1>
              Cache <span>Warmup</span>
            </h1>
            <p className="lede">
              The fundamentals are still in there, just sitting in cold storage. Short lessons, quick checks,
              and interview reps to bring them back up to L1.
            </p>
          </div>
          <ContinueCard progress={progress} />
        </div>
        <Stats progress={progress} />
      </section>

      {TRACKS.map((track) => (
        <section className="track" key={track.name}>
          <div className="track-head">
            <h2>{track.name}</h2>
            <p>{track.blurb}</p>
          </div>
          <div className="lesson-list">
            {lessons
              .filter((l) => l.track === track.name)
              .map((l) => (
                <LessonRow key={l.id} lesson={l} progress={progress} />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Stats({ progress }: { progress: Progress }) {
  const reviews = progress.hits + progress.misses;
  const hitRate = reviews ? `${Math.round((progress.hits / reviews) * 100)}%` : "–";

  return (
    <div className="panel stats">
      <LevelBar xp={progress.xp} />
      <div className="kpis">
        <Kpi value={`${Object.keys(progress.done).length}/${lessons.length}`} label="lessons" />
        <Kpi value={String(streak(progress.days, today()))} label="day streak" />
        <Kpi value={hitRate} label="recall hit rate" />
      </div>
      <MemoryHierarchy progress={progress} />
      <ReviewRow progress={progress} />
      <ProdRow progress={progress} />
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="kpi">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** How many cards sit in each tier, hottest (L1) on top. */
function MemoryHierarchy({ progress }: { progress: Progress }) {
  const counts = tierCounts(progress.cards);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const rows = TIERS.map((tier, i) => ({ tier, count: counts[i], i })).reverse();

  return (
    <div className="hierarchy">
      <div className="hierarchy-head">
        <span className="eyebrow">Memory hierarchy</span>
        <span className="hierarchy-note">{total} cards</span>
      </div>
      {rows.map(({ tier, count, i }) => (
        <div className={`tier-row tier-${i}`} key={tier.name}>
          <span>{tier.name}</span>
          <span className="tier-track">
            <i style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className="tier-count">{count}</span>
        </div>
      ))}
      <p className="hierarchy-note">
        Cards move toward L1 each time you remember them, and drop back to disk when you don't.
      </p>
    </div>
  );
}

function ContinueCard({ progress }: { progress: Progress }) {
  const lesson = nextLesson(lessons, progress);
  if (!lesson) return <AllDoneCard />;

  const inProgress = lessonStatus(lesson, progress) === "in-progress";
  const anyDone = Object.keys(progress.done).length > 0;
  const step = (progress.pos[lesson.id] ?? 0) + 1;

  return (
    <div className="panel today-card continue">
      <span className="big-number" aria-hidden="true">
        {twoDigits(lesson.n)}
      </span>
      <p className="eyebrow">
        {continueEyebrow(inProgress, anyDone)} · {lesson.track}
      </p>
      <h2>{lesson.title}</h2>
      <p>{lesson.tag}</p>
      <div className="row actions">
        <a className="btn" href={hrefFor({ view: "lesson", id: lesson.id })}>
          {inProgress
            ? `Continue · step ${step} of ${playerSteps(lesson).length}`
            : `Start lesson ${lesson.n}`}
        </a>
        <span className="mono-note">~{lesson.mins} min</span>
      </div>
    </div>
  );
}

function AllDoneCard() {
  return (
    <div className="panel today-card">
      <p className="eyebrow">All {lessons.length} lessons done</p>
      <h2>The whole syllabus is in cache.</h2>
      <p>Keep it warm with reviews, and do a few gym reps before any interview.</p>
      <div className="row actions">
        <a className="btn" href={hrefFor({ view: "gym" })}>
          Go to the interview gym
        </a>
      </div>
    </div>
  );
}

/** The review deck, under the hierarchy it fills: cards going cold, when the next ones come, or none yet. */
function ReviewRow({ progress }: { progress: Progress }) {
  const now = today();
  const due = dueCardKeys(progress.cards, now, isKnownCard).length;
  const total = Object.keys(progress.cards).length;
  const { title, text } = reviewCopy(due, total, nextDueDay(progress.cards), now);

  return (
    <div className="review-row">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {total > 0 && (
        <a className={due ? "btn small" : "btn ghost small"} href={hrefFor({ view: "review" })}>
          {due ? `Review ${due}` : "Practice anyway"}
        </a>
      )}
    </div>
  );
}

/** Prod in one line: how big it's grown, and a nudge when there's XP to spend or an upgrade paged. */
function ProdRow({ progress }: { progress: Progress }) {
  const health = prodHealth(lessons, progress, today());
  const { rps } = throughput(progress.prod.owned, health);
  const paged = pagedCount(progress.prod.owned, health);
  const shopping = [SERVERS, ...lessons.map((l) => l.id)].some((id) => canBuy(progress, id));
  const text = paged
    ? `${plural(paged, "upgrade")} paged by a cold lesson. Review to bring ${paged === 1 ? "it" : "them"} back.`
    : `${compact(rps)} req/s · ${xpToSpend(progress)} XP to spend`;

  return (
    <div className="review-row">
      <div>
        <h2>Prod: {stageInfo(rps).name}</h2>
        <p>{text}</p>
      </div>
      <a className={shopping ? "btn small" : "btn ghost small"} href={hrefFor({ view: "prod" })}>
        {shopping ? "Spend XP" : "Open prod"}
      </a>
    </div>
  );
}

function LessonRow({ lesson, progress }: { lesson: Lesson; progress: Progress }) {
  return (
    <a className="lesson-row" href={hrefFor({ view: "lesson", id: lesson.id })}>
      <span className="lesson-number">{twoDigits(lesson.n)}</span>
      <div>
        <h3>{lesson.title}</h3>
        <p>{lesson.tag}</p>
      </div>
      <LessonPill lesson={lesson} progress={progress} />
    </a>
  );
}

/** A finished lesson's temperature, the current step, or the time it takes. */
function LessonPill({ lesson, progress }: { lesson: Lesson; progress: Progress }) {
  switch (lessonStatus(lesson, progress)) {
    case "done":
      return <TemperaturePill lesson={lesson} />;
    case "in-progress":
      return (
        <span className="pill progress">
          {(progress.pos[lesson.id] ?? 0) + 1}/{playerSteps(lesson).length}
        </span>
      );
    case "new":
      return <span className="pill">{lesson.mins} min</span>;
  }
}

function continueEyebrow(inProgress: boolean, anyDone: boolean) {
  if (inProgress) return "Pick up where you left off";
  return anyDone ? "Up next" : "Start here";
}

/** The review row's heading and line. */
function reviewCopy(due: number, total: number, nextDue: Day | undefined, now: Day) {
  if (due) {
    return {
      title: `${plural(due, "card")} going cold`,
      text: "A few minutes of recall now keeps them from dropping back to disk.",
    };
  }

  if (total) return { title: "Cache is warm", text: `Next review ${prettyDay(nextDue, now)}.` };

  return {
    title: "No cards yet",
    text: "Finish a lesson and its flashcards land here, spaced out over days.",
  };
}
