import { useState } from "react";
import { lessonById } from "../content/lessons";
import { hrefFor } from "../router";
import { useProgress } from "../state/ProgressContext";
import { cardFor } from "../state/selectors";
import { TIERS, dueCardKeys } from "../state/srs";
import { prettyDay, today } from "../utils/dates";
import { shuffledIndexes } from "../utils/shuffle";
import "./Review.css";

type Session = {
  mode: "due" | "practice";
  queue: string[];
  index: number;
  flipped: boolean;
  got: number;
  fuzzy: number;
};

const SESSION_SIZE = 20;
const exists = (key: string) => Boolean(cardFor(key, lessonById));

export function Review() {
  const { progress, dispatch } = useProgress();
  const [session, setSession] = useState<Session | null>(null);
  const now = today();
  const due = dueCardKeys(progress.cards, now, exists);
  const all = Object.keys(progress.cards).filter(exists);

  const start = (mode: Session["mode"]) => {
    const queue =
      mode === "due" ? due : shuffledIndexes(all.length, `practice-${Date.now()}`).map((i) => all[i]);
    setSession({ mode, queue: queue.slice(0, SESSION_SIZE), index: 0, flipped: false, got: 0, fuzzy: 0 });
  };

  const grade = (remembered: boolean) => {
    if (!session) return;
    // Practice runs don't move cards between tiers.
    if (session.mode === "due") {
      dispatch({ type: "review", cardKey: session.queue[session.index], remembered, today: now });
    }
    setSession({
      ...session,
      index: session.index + 1,
      flipped: false,
      got: session.got + (remembered ? 1 : 0),
      fuzzy: session.fuzzy + (remembered ? 0 : 1),
    });
  };

  const legend = (
    <div className="tier-legend">
      {TIERS.map((t) => (
        <div key={t.name}>
          <b>{t.name}</b>
          {t.blurb}
        </div>
      ))}
    </div>
  );

  if (!session) {
    const nextDue = Object.values(progress.cards)
      .map((c) => c.due)
      .sort()[0];
    return (
      <div className="review">
        <div className="review-head">
          <h1>Review</h1>
          <span className="mono-note">{all.length} cards in deck</span>
        </div>
        <div className="panel review-empty">
          <h2>
            {due.length
              ? `${due.length} card${due.length === 1 ? "" : "s"} due`
              : all.length
                ? "Nothing due right now"
                : "Your deck is empty"}
          </h2>
          <p>
            {due.length
              ? "Flip each card, then say honestly whether you knew it. Remembered cards move up a tier and come back later."
              : all.length
                ? `Next cards come due ${prettyDay(nextDue, now)}. You can still practice without moving anything between tiers.`
                : "Each lesson you finish adds its flashcards here. They come back on a schedule so they stick."}
          </p>
          {due.length ? (
            <button className="btn" onClick={() => start("due")}>
              Start review
            </button>
          ) : all.length ? (
            <button className="btn ghost" onClick={() => start("practice")}>
              Practice all {all.length}
            </button>
          ) : (
            <a className="btn" href={hrefFor({ view: "home" })}>
              Go to the path
            </a>
          )}
        </div>
        {legend}
      </div>
    );
  }

  if (session.index >= session.queue.length) {
    return (
      <div className="review">
        <div className="review-head">
          <h1>{session.mode === "practice" ? "Practice done" : "Review done"}</h1>
        </div>
        <div className="panel review-empty">
          <h2>
            {session.got} remembered · {session.fuzzy} fuzzy
          </h2>
          <p>
            {session.mode === "practice"
              ? "Practice runs don't move cards between tiers."
              : session.fuzzy
                ? "The fuzzy ones went back to disk and will show up tomorrow."
                : "Everything moved up a tier. Nice."}
          </p>
          <div className="row">
            <a className="btn" href={hrefFor({ view: "home" })}>
              Back to the path
            </a>
            {due.length > 0 && (
              <button className="btn ghost" onClick={() => start("due")}>
                Review {due.length} more
              </button>
            )}
          </div>
        </div>
        {legend}
      </div>
    );
  }

  const key = session.queue[session.index];
  const card = cardFor(key, lessonById)!;
  const tier = TIERS[progress.cards[key]?.box ?? 0];

  return (
    <div className="review">
      <div className="review-head">
        <h1>{session.mode === "practice" ? "Practice" : "Review"}</h1>
        <span className="mono-note">
          {session.index + 1} / {session.queue.length}
        </span>
      </div>
      <div className="index-card">
        <span className="card-tier">In {tier.name}</span>
        <span className="card-source">
          {String(card.lesson.n).padStart(2, "0")} · {card.lesson.title}
        </span>
        <p className="card-front">{card.front}</p>
        {session.flipped && <p className="card-back">{card.back}</p>}
        <div className="card-actions">
          {session.flipped ? (
            <div className="grade">
              <button className="btn ghost" onClick={() => grade(false)}>
                Fuzzy
              </button>
              <button className="btn" onClick={() => grade(true)}>
                Got it
              </button>
            </div>
          ) : (
            <button className="btn" onClick={() => setSession({ ...session, flipped: true })}>
              Show answer
            </button>
          )}
        </div>
      </div>
      <p className="muted">Say the answer out loud before you flip. It sticks better.</p>
    </div>
  );
}
