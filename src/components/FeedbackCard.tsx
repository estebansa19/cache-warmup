import { SCORE_LABELS } from "../ai/prompt";
import type { Feedback } from "../state/progress";
import { prettyDay } from "../utils/dates";

export function FeedbackCard({ feedback, day }: { feedback: Feedback; day?: string }) {
  const score = Math.max(1, Math.min(5, feedback.score));
  return (
    <div className="feedback">
      <div className="feedback-head">
        <span className={`score s${score}`}>{SCORE_LABELS[score]}</span>
        <span className="ticks" aria-label={`${score} out of 5`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} className={i <= score ? "on" : ""} />
          ))}
        </span>
        {day && <span className="feedback-day">{prettyDay(day)}</span>}
      </div>
      {feedback.verdict && <p className="feedback-verdict">{feedback.verdict}</p>}
      <div className="feedback-columns">
        <div>
          <h4>What landed</h4>
          <ul>
            {feedback.strengths.length ? feedback.strengths.map((s) => <li key={s}>{s}</li>) : <li>–</li>}
          </ul>
        </div>
        <div>
          <h4>What was missing</h4>
          <ul>
            {feedback.gaps.length ? feedback.gaps.map((g) => <li key={g}>{g}</li>) : <li>Nothing major.</li>}
          </ul>
        </div>
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
