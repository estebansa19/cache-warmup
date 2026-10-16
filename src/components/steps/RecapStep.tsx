import type { Lesson } from "../../content/types";
import { hrefFor } from "../../router";
import { XP } from "../../state/levels";
import { useProgress } from "../../state/ProgressContext";
import { lessonScore } from "../../state/selectors";
import { prettyDay, today } from "../../utils/dates";

export function RecapStep({ lesson }: { lesson: Lesson }) {
  const { progress, dispatch } = useProgress();
  const score = lessonScore(lesson, progress);
  const done = progress.done[lesson.id];
  const interviewDone = Boolean(progress.iv[lesson.id]?.xp);

  const finish = () =>
    dispatch({
      type: "finish",
      lessonId: lesson.id,
      correct: score.correct,
      total: score.total,
      cardCount: lesson.cards.length,
      today: today(),
    });

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
            Finished {prettyDay(done.at) === "today" ? "today" : `on ${prettyDay(done.at)}`}. Its cards are in
            your review deck.
          </div>
          <div className="row">
            <a className="btn" href={hrefFor({ view: "home" })}>
              Back to the path
            </a>
            <a className="btn ghost" href={hrefFor({ view: "notes" })}>
              All cheat sheets
            </a>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="btn" onClick={finish}>
            Finish lesson · +{XP.lesson} XP
          </button>
          <span className="muted">Adds {lesson.cards.length} flashcards. First review is tomorrow.</span>
        </div>
      )}
    </>
  );
}
