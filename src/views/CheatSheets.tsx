import { lessons } from "../content/lessons";
import { useProgress } from "../state/ProgressContext";
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
        {lessons.map((l) => {
          const label = `${String(l.n).padStart(2, "0")} · ${l.track}`;
          return progress.done[l.id] ? (
            <div className="panel note-card" key={l.id}>
              <p className="eyebrow">{label}</p>
              <h3>{l.title}</h3>
              <div className="cheat">{l.cheatSheet}</div>
            </div>
          ) : (
            <div className="panel note-card locked" key={l.id}>
              <p className="eyebrow">{label}</p>
              <h3>{l.title}</h3>
              <p className="muted">Finish the lesson to unlock its cheat sheet.</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
