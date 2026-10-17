import { useEffect, useRef, useState } from "react";
import { cardByKey, isKnownCard } from "../content/lessons";
import { hrefFor } from "../router";
import { useProgress } from "../state/ProgressContext";
import { TIERS, dueCardKeys, nextDueDay } from "../state/srs";
import { prettyDay, today } from "../utils/dates";
import { focusFirst } from "../utils/focus";
import { shuffledIndexes } from "../utils/shuffle";
import { plural, twoDigits } from "../utils/text";
import "./Review.css";

const SESSION_SIZE = 20;

type Mode = "due" | "practice";

type Session = {
  mode: Mode;
  queue: string[];
  index: number;
  flipped: boolean;
  got: number;
  fuzzy: number;
};

export function Review() {
  const { progress, dispatch } = useProgress();
  const [session, setSession] = useState<Session | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const now = today();
  const due = dueCardKeys(progress.cards, now, isKnownCard);
  const all = Object.keys(progress.cards).filter(isKnownCard);

  // The button you pressed goes away (Start, Show answer, Got it), so move focus to what's new:
  // the card's question, its answer once flipped, or the summary when the session ends.
  useEffect(() => {
    if (!session) return;

    if (session.index >= session.queue.length) focusFirst(page.current, "h1");
    else focusFirst(page.current, session.flipped ? ".card-back" : ".card-front");
  }, [session]);

  function start(mode: Mode) {
    const queue =
      mode === "due" ? due : shuffledIndexes(all.length, `practice-${Date.now()}`).map((i) => all[i]);

    setSession({ mode, queue: queue.slice(0, SESSION_SIZE), index: 0, flipped: false, got: 0, fuzzy: 0 });
  }

  function flip() {
    if (session) setSession({ ...session, flipped: true });
  }

  function grade(remembered: boolean) {
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
  }

  if (!session) {
    return (
      <ReviewStart due={due.length} total={all.length} nextDue={nextDueDay(progress.cards)} onStart={start} />
    );
  }

  if (session.index >= session.queue.length) {
    return (
      <div className="review" ref={page}>
        <ReviewSummary session={session} due={due.length} onStart={start} />
        <TierLegend />
      </div>
    );
  }

  const key = session.queue[session.index];

  return (
    <div className="review" ref={page}>
      <div className="review-head">
        <h1>{session.mode === "practice" ? "Practice" : "Review"}</h1>
        <span className="mono-note">
          {session.index + 1} / {session.queue.length}
        </span>
      </div>
      <FlashCard
        cardKey={key}
        box={progress.cards[key]?.box ?? 0}
        flipped={session.flipped}
        onFlip={flip}
        onGrade={grade}
      />
      <p className="muted">Say the answer out loud before you flip. It sticks better.</p>
    </div>
  );
}

type ReviewStartProps = { due: number; total: number; nextDue?: string; onStart: (mode: Mode) => void };

function ReviewStart({ due, total, nextDue, onStart }: ReviewStartProps) {
  const { title, text, action } = startScreen(due, total, nextDue, onStart);

  return (
    <div className="review">
      <div className="review-head">
        <h1>Review</h1>
        <span className="mono-note">{total} cards in deck</span>
      </div>
      <div className="panel review-empty">
        <h2>{title}</h2>
        <p>{text}</p>
        {action}
      </div>
      <TierLegend />
    </div>
  );
}

type ReviewSummaryProps = { session: Session; due: number; onStart: (mode: Mode) => void };

function ReviewSummary({ session, due, onStart }: ReviewSummaryProps) {
  const practice = session.mode === "practice";

  return (
    <>
      <div className="review-head">
        <h1>{practice ? "Practice done" : "Review done"}</h1>
      </div>
      <div className="panel review-empty">
        <h2>
          {session.got} remembered · {session.fuzzy} fuzzy
        </h2>
        <p>{summaryText(session)}</p>
        <div className="row">
          <a className="btn" href={hrefFor({ view: "home" })}>
            Back to the path
          </a>
          {due > 0 && (
            <button className="btn ghost" onClick={() => onStart("due")}>
              Review {due} more
            </button>
          )}
        </div>
      </div>
    </>
  );
}

type FlashCardProps = {
  cardKey: string;
  box: number;
  flipped: boolean;
  onFlip: () => void;
  onGrade: (remembered: boolean) => void;
};

function FlashCard({ cardKey, box, flipped, onFlip, onGrade }: FlashCardProps) {
  const card = cardByKey.get(cardKey)!;
  const tier = TIERS[box] ?? TIERS[0];

  return (
    <div className="index-card">
      <span className="card-tier">In {tier.name}</span>
      <span className="card-source">
        {twoDigits(card.lesson.n)} · {card.lesson.title}
      </span>
      <p className="card-front">{card.front}</p>
      {flipped && <p className="card-back">{card.back}</p>}
      <div className="card-actions">
        {flipped ? (
          <div className="grade">
            <button className="btn ghost" onClick={() => onGrade(false)}>
              Fuzzy
            </button>
            <button className="btn" onClick={() => onGrade(true)}>
              Got it
            </button>
          </div>
        ) : (
          <button className="btn" onClick={onFlip}>
            Show answer
          </button>
        )}
      </div>
    </div>
  );
}

function TierLegend() {
  return (
    <div className="tier-legend">
      {TIERS.map((t) => (
        <div key={t.name}>
          <b>{t.name}</b>
          {t.blurb}
        </div>
      ))}
    </div>
  );
}

/** What the start screen says and offers: start the due cards, practice them all, or go get some. */
function startScreen(due: number, total: number, nextDue: string | undefined, onStart: (mode: Mode) => void) {
  if (due) {
    return {
      title: `${plural(due, "card")} due`,
      text: "Flip each card, then say honestly whether you knew it. Remembered cards move up a tier and come back later.",
      action: (
        <button className="btn" onClick={() => onStart("due")}>
          Start review
        </button>
      ),
    };
  }

  if (total) {
    return {
      title: "Nothing due right now",
      text: `Next cards come due ${prettyDay(nextDue)}. You can still practice without moving anything between tiers.`,
      action: (
        <button className="btn ghost" onClick={() => onStart("practice")}>
          Practice all {total}
        </button>
      ),
    };
  }

  return {
    title: "Your deck is empty",
    text: "Each lesson you finish adds its flashcards here. They come back on a schedule so they stick.",
    action: (
      <a className="btn" href={hrefFor({ view: "home" })}>
        Go to the path
      </a>
    ),
  };
}

function summaryText(session: Session) {
  if (session.mode === "practice") return "Practice runs don't move cards between tiers.";
  if (session.fuzzy) return "The fuzzy ones went back to disk and will show up tomorrow.";
  return "Everything moved up a tier. Nice.";
}
