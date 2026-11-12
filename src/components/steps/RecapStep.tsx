import type { Lesson } from "../../content/types";
import { hrefFor } from "../../router";
import { useProgress } from "../../state/ProgressContext";
import { lessonScore } from "../../state/selectors";
import { prettyDay } from "../../utils/dates";

/** The last step: the cheat sheet and how the lesson went. The player's main button finishes it. */
export function RecapStep({ lesson }: { lesson: Lesson }) {
  const { progress } = useProgress();
  const score = lessonScore(lesson, progress);
  const done = progress.done[lesson.id];
  const finishedOn = done ? prettyDay(done.at) : "";
  const interviewDone = Boolean(progress.iv[lesson.id]?.xp);

  return (
    <>
      <span className="eyebrow step-kind recap">
        <i />
        Cheat sheet
      </span>
      <h2>{lesson.title}, on one card</h2>
      <div className="cheat">{lesson.cheatSheet}</div>
      <div className="recap-stats">
        <div>
          <b>
            {score.correct}/{score.total}
          </b>
          <span>checks right</span>
        </div>
        <div>
          <b>{interviewDone ? "✓" : "–"}</b>
          <span>interview rep</span>
        </div>
        <div>
          <b>{lesson.cards.length}</b>
          <span>cards to warm</span>
        </div>
      </div>
      {done ? (
        <>
          <div className="done-banner">
            Finished {finishedOn === "today" ? "today" : `on ${finishedOn}`}. Its cards are in your review
            deck.
          </div>
          <div className="row">
            <a className="btn ghost" href={hrefFor({ view: "notes" })}>
              All cheat sheets
            </a>
          </div>
        </>
      ) : (
        <p className="muted">Finishing adds {lesson.cards.length} flashcards. First review is tomorrow.</p>
      )}
    </>
  );
}
