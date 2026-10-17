import { lessons } from "../content/lessons";
import type { Lesson } from "../content/types";
import { useProgress } from "../state/ProgressContext";
import { twoDigits } from "../utils/text";
import "./Pages.css";

export function CheatSheets() {
  const { progress } = useProgress();
  const unlocked = lessons.filter((l) => progress.done[l.id]).length;

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">
          {unlocked} of {lessons.length} unlocked
        </p>
        <h1>Cheat sheets</h1>
        <p>One card per lesson. Skim these the night before an interview.</p>
      </div>
      <div className="notes-grid">
        {lessons.map((l) => (
          <CheatSheetCard key={l.id} lesson={l} unlocked={Boolean(progress.done[l.id])} />
        ))}
      </div>
    </>
  );
}

function CheatSheetCard({ lesson, unlocked }: { lesson: Lesson; unlocked: boolean }) {
  return (
    <div className={unlocked ? "panel note-card" : "panel note-card locked"}>
      <p className="eyebrow">
        {twoDigits(lesson.n)} · {lesson.track}
      </p>
      <h3>{lesson.title}</h3>
      {unlocked ? (
        <div className="cheat">{lesson.cheatSheet}</div>
      ) : (
        <p className="muted">Finish the lesson to unlock its cheat sheet.</p>
      )}
    </div>
  );
}
