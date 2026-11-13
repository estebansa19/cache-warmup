import { levelInfo } from "../state/levels";
import "./LevelBar.css";

/** Your level and the way to the next one. `gained` shows what was just earned instead of the total. */
export function LevelBar({ xp, gained }: { xp: number; gained?: number }) {
  const level = levelInfo(xp);
  const toNext = level.next ? `${level.next.xp - xp} to ${level.next.name}` : "max level";

  return (
    <div className="level">
      <div className="level-row">
        <span className="level-name">{level.name}</span>
        <span className="mono-note">
          {gained ? `+${gained} XP` : `${xp} XP`} · {toNext}
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
    </div>
  );
}
