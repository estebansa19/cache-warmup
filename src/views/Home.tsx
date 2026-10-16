import { cardByKey, lessons } from "../content/lessons";
import { TRACKS, playerSteps, type Lesson } from "../content/types";
import { hrefFor } from "../router";
import { levelInfo, streak } from "../state/levels";
import { useProgress } from "../state/ProgressContext";
import { lessonScore, lessonStatus, nextLesson } from "../state/selectors";
import { TIERS, dueCardKeys, tierCounts } from "../state/srs";
import type { Progress } from "../state/progress";
import { prettyDay, today } from "../utils/dates";
import "./Home.css";

const pad = (n: number) => String(n).padStart(2, "0");

export function Home() {
  const { progress } = useProgress();
  return (
    <>
      <section className="hero">
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
        <Stats progress={progress} />
      </section>

      <section className="today">
        <ContinueCard progress={progress} />
        <ReviewCard progress={progress} />
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
  const level = levelInfo(progress.xp);
  const reviews = progress.hits + progress.misses;
  const counts = tierCounts(progress.cards);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="panel stats">
      <div className="level-row">
        <span className="level-name">{level.name}</span>
        <span className="mono-note">
          {progress.xp} XP
          {level.next ? ` · ${level.next.xp - progress.xp} to ${level.next.name}` : " · max level"}
        </span>
      </div>
      <div
        className="xp-bar"
        role="progressbar"
        aria-label="Progress to next level"
        aria-valuenow={Math.round(level.percent)}
      >
        <i style={{ width: `${level.percent}%` }} />
      </div>
      <div className="kpis">
        <Kpi value={`${Object.keys(progress.done).length}/${lessons.length}`} label="lessons" />
        <Kpi value={String(streak(progress.days, today()))} label="day streak" />
        <Kpi
          value={reviews ? `${Math.round((progress.hits / reviews) * 100)}%` : "–"}
          label="recall hit rate"
        />
      </div>
      <div className="hierarchy">
        <div className="hierarchy-head">
          <span className="eyebrow">Memory hierarchy</span>
          <span className="hierarchy-note">{total} cards</span>
        </div>
        {TIERS.map((tier, i) => ({ tier, n: counts[i], i }))
          .reverse()
          .map(({ tier, n, i }) => (
            <div className={`tier-row tier-${i}`} key={tier.name}>
              <span>{tier.name}</span>
              <span className="tier-track">
                <i style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="tier-count">{n}</span>
            </div>
          ))}
        <p className="hierarchy-note">
          Cards move toward L1 each time you remember them, and drop back to disk when you don't.
        </p>
      </div>
    </div>
  );
}

const Kpi = ({ value, label }: { value: string; label: string }) => (
  <div className="kpi">
    <b>{value}</b>
    <span>{label}</span>
  </div>
);

function ContinueCard({ progress }: { progress: Progress }) {
  const lesson = nextLesson(lessons, progress);
  if (!lesson) {
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
  const status = lessonStatus(lesson, progress);
  const anyDone = Object.keys(progress.done).length > 0;
  const step = (progress.pos[lesson.id] ?? 0) + 1;

  return (
    <div className="panel today-card continue">
      <span className="big-number" aria-hidden="true">
        {pad(lesson.n)}
      </span>
      <p className="eyebrow">
        {status === "in-progress" ? "Pick up where you left off" : anyDone ? "Up next" : "Start here"} ·{" "}
        {lesson.track}
      </p>
      <h2>{lesson.title}</h2>
      <p>{lesson.tag}</p>
      <div className="row actions">
        <a className="btn" href={hrefFor({ view: "lesson", id: lesson.id })}>
          {status === "in-progress"
            ? `Continue · step ${step} of ${playerSteps(lesson).length}`
            : `Start lesson ${lesson.n}`}
        </a>
        <span className="mono-note">~{lesson.mins} min</span>
      </div>
    </div>
  );
}

function ReviewCard({ progress }: { progress: Progress }) {
  const now = today();
  const due = dueCardKeys(progress.cards, now, (k) => cardByKey.has(k)).length;
  const total = Object.keys(progress.cards).length;
  const nextDue = Object.values(progress.cards)
    .map((c) => c.due)
    .sort()[0];

  return (
    <div className="panel today-card">
      <p className="eyebrow">Review</p>
      <h2>
        {due ? `${due} card${due === 1 ? "" : "s"} going cold` : total ? "Cache is warm" : "No cards yet"}
      </h2>
      <p>
        {due
          ? "A few minutes of recall now keeps them from dropping back to disk."
          : total
            ? `Next review ${prettyDay(nextDue, now)}.`
            : "Finish a lesson and its flashcards land here, spaced out over days."}
      </p>
      {total > 0 && (
        <div className="row actions">
          <a className={due ? "btn" : "btn ghost"} href={hrefFor({ view: "review" })}>
            {due ? `Review ${due}` : "Practice anyway"}
          </a>
        </div>
      )}
    </div>
  );
}

function LessonRow({ lesson, progress }: { lesson: Lesson; progress: Progress }) {
  const status = lessonStatus(lesson, progress);
  const score = lessonScore(lesson, progress);
  return (
    <a className="lesson-row" href={hrefFor({ view: "lesson", id: lesson.id })}>
      <span className="lesson-number">{pad(lesson.n)}</span>
      <div>
        <h3>{lesson.title}</h3>
        <p>{lesson.tag}</p>
      </div>
      {status === "done" ? (
        <span className="pill done">
          done · {score.correct}/{score.total}
        </span>
      ) : status === "in-progress" ? (
        <span className="pill progress">
          {(progress.pos[lesson.id] ?? 0) + 1}/{playerSteps(lesson).length}
        </span>
      ) : (
        <span className="pill">{lesson.mins} min</span>
      )}
    </a>
  );
}
