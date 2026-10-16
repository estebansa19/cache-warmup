import { lessonById } from "../content/lessons";
import { hrefFor, type Route } from "../router";
import { useProgress } from "../state/ProgressContext";
import { dueCardKeys } from "../state/srs";
import { cardFor } from "../state/selectors";
import { today } from "../utils/dates";
import "./Nav.css";

const LINKS = [
  { view: "home", label: "Path" },
  { view: "review", label: "Review" },
  { view: "gym", label: "Interview gym" },
  { view: "notes", label: "Cheat sheets" },
  { view: "settings", label: "Settings" },
] as const;

export function Nav({ route }: { route: Route }) {
  const { progress } = useProgress();
  const due = dueCardKeys(progress.cards, today(), (key) => Boolean(cardFor(key, lessonById))).length;
  const current = route.view === "lesson" ? "home" : route.view;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#/" aria-label="Cache Warmup home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-name">Cache Warmup</span>
        </a>
        <nav className="nav" aria-label="Sections">
          {LINKS.map((link) => (
            <a
              key={link.view}
              href={hrefFor({ view: link.view })}
              aria-current={current === link.view ? "page" : undefined}
            >
              {link.label}
              {link.view === "review" && due > 0 && (
                <span className="badge" aria-label={`${due} due`}>
                  {due}
                </span>
              )}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
