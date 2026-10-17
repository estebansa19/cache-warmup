import { SCORE_LABELS } from "../ai/feedback";
import type { Feedback } from "../state/progress";
import { prettyDay } from "../utils/dates";

export function FeedbackCard({ feedback, day }: { feedback: Feedback; day?: string }) {
  const score = Math.max(1, Math.min(5, feedback.score));

  return (
    <div className="feedback">
      <div className="feedback-head">
        <span className={`score s${score}`}>{SCORE_LABELS[score]}</span>
        <span className="ticks" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} className={i <= score ? "on" : ""} />
          ))}
        </span>
        <span className="sr-only">{score} out of 5</span>
        {day && <span className="feedback-day">{prettyDay(day)}</span>}
      </div>
      {feedback.verdict && <p className="feedback-verdict">{feedback.verdict}</p>}
      <div className="feedback-columns">
        <FeedbackList title="What landed" items={feedback.strengths} empty="–" />
        <FeedbackList title="What was missing" items={feedback.gaps} empty="Nothing major." />
      </div>
      <div className="feedback-extra">
        {feedback.tip && (
          <p>
            <b>Next time:</b> {feedback.tip}
          </p>
        )}
        {feedback.followup && (
          <p>
            <b>They'd ask next:</b> {feedback.followup}
          </p>
        )}
      </div>
    </div>
  );
}

type FeedbackListProps = { title: string; items: string[]; empty: string };

function FeedbackList({ title, items, empty }: FeedbackListProps) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>{items.length ? items.map((item, i) => <li key={i}>{item}</li>) : <li>{empty}</li>}</ul>
    </div>
  );
}
