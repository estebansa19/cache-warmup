import type { Lesson } from "../../content/types";
import { useProgress } from "../../state/ProgressContext";
import { WarmupTrace, type JustFinished } from "../WarmupTrace";

type Props = { lesson: Lesson; justFinished: JustFinished | null };

/**
 * The last step: the cheat sheet, and once the lesson is finished (the player's main button
 * does that) its warm-up trace above it.
 */
export function RecapStep({ lesson, justFinished }: Props) {
  const { progress } = useProgress();
  const done = Boolean(progress.done[lesson.id]);
  const title = `${lesson.title}, on one card`;

  return (
    <>
      {done && <WarmupTrace lesson={lesson} justFinished={justFinished} />}
      <span className="eyebrow step-kind recap">
        <i />
        Cheat sheet
      </span>
      {done ? <h3>{title}</h3> : <h2>{title}</h2>}
      <div className="cheat">{lesson.cheatSheet}</div>
      {!done && (
        <p className="muted">
          Finishing writes {lesson.cards.length} flashcards to Disk. The first review is tomorrow.
        </p>
      )}
    </>
  );
}
