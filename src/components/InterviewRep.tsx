import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAI } from "../ai/AIContext";
import { AIError } from "../ai/client";
import { hrefFor } from "../router";
import { useProgress } from "../state/ProgressContext";
import { today } from "../utils/dates";
import { words } from "../utils/shuffle";
import { FeedbackCard } from "./FeedbackCard";
import "./InterviewRep.css";

export type InterviewQuestion = { question: string; rubric?: string[] | null; answer?: ReactNode };

const ERRORS: Record<string, string> = {
  unreachable:
    "Can't reach the AI server. Is `npm start` (or `npm run dev`) still running? Your answer is saved.",
  busy: "Another answer is being graded. Give it a moment, then try again.",
  timeout: "The AI tool took too long to answer. Try again in a bit.",
  no_provider: "AI feedback is off. Pick a tool in Settings.",
  invalid_json: "The feedback came back garbled. Try again.",
  refused: "The model declined to grade that one. Try rephrasing your answer.",
};

/** One interview question: write an answer, get AI feedback, or compare with a strong answer. */
export function InterviewRep({ id, question }: { id: string; question: InterviewQuestion }) {
  const { progress, dispatch } = useProgress();
  const ai = useAI();
  const state = progress.iv[id] ?? {};
  const draft = state.draft ?? "";
  const [showAnswer, setShowAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const askButton = useRef<HTMLButtonElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const wasBusy = useRef(false);
  const hasStrongAnswer = Boolean(question.answer || question.rubric?.length);
  const aiOn = Boolean(ai.status?.enabled);

  // Leaving the question (or the page) stops the request, so the AI tool stops too.
  useEffect(() => () => abort.current?.abort(), []);

  // The feedback button is replaced while waiting: focus Stop, then whatever came back.
  useEffect(() => {
    if (busy) stopButton.current?.focus();
    else if (wasBusy.current) {
      const target =
        result.current?.querySelector<HTMLElement>(".error-text:not(:empty), .feedback") ?? askButton.current;
      if (target && target !== askButton.current) target.tabIndex = -1;
      target?.focus();
    }
    wasBusy.current = busy;
  }, [busy]);

  async function askForFeedback() {
    if (words(draft) < 25) {
      setError("Write a bit more first. A few sentences gives the interviewer something to react to.");
      return;
    }
    setError(null);
    setDone(false);
    setBusy(true);
    abort.current = new AbortController();
    try {
      const feedback = await ai.ask(
        {
          question: question.question,
          rubric: question.rubric ?? null,
          answer: draft,
          profile: progress.profile,
        },
        abort.current.signal,
      );
      dispatch({ type: "feedback", key: id, feedback, today: today() });
      setDone(true);
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError("unreachable");
      if (err.code !== "cancelled")
        setError(ERRORS[err.code] ?? `The AI tool reported a problem: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleAnswer() {
    if (!showAnswer) dispatch({ type: "revealAnswer", key: id, today: today() });
    setShowAnswer(!showAnswer);
  }

  return (
    <div className="interview">
      <h2 className="interview-question">“{question.question}”</h2>
      <label className="sr-only" htmlFor={`answer-${id}`}>
        Your answer
      </label>
      <textarea
        id={`answer-${id}`}
        className="ruled"
        value={draft}
        onChange={(e) => dispatch({ type: "draft", key: id, text: e.target.value })}
        placeholder="Answer the way you'd say it out loud. Bullets are fine. Aim for 150–300 words."
      />

      <div className="row">
        {aiOn && !busy && (
          <button className="btn" ref={askButton} onClick={askForFeedback}>
            {state.fb ? "Get fresh feedback" : "Get interviewer feedback"}
          </button>
        )}
        {ai.phase === "checking" && (
          <button className="btn" disabled>
            Looking for AI feedback…
          </button>
        )}
        {hasStrongAnswer && (
          <button className="btn ghost" onClick={toggleAnswer} aria-expanded={showAnswer}>
            {showAnswer ? "Hide the strong answer" : "Compare with a strong answer"}
          </button>
        )}
        <span className="word-count">{words(draft)} words</span>
      </div>

      {ai.phase !== "checking" && !aiOn && (
        <p className="muted">
          AI feedback is off, so compare with the strong answer for now.{" "}
          <a href={hrefFor({ view: "settings" })}>Turn on AI feedback</a> (about a minute).
        </p>
      )}
      {aiOn && !busy && ai.status?.active && (
        <p className="muted">
          Feedback comes from {ai.status.active.label}, using {ai.status.active.usage}.
        </p>
      )}

      {busy && (
        <div className="thinking">
          <span className="pulse" />
          <span aria-hidden="true">The interviewer is reading your answer…</span>
          <button className="btn ghost small" ref={stopButton} onClick={() => abort.current?.abort()}>
            Stop
          </button>
        </div>
      )}
      <p role="status" className="live sr-only">
        {busy ? "The interviewer is reading your answer." : done ? "Feedback is ready." : ""}
      </p>
      <div ref={result}>
        <p role="alert" className="error-text live">
          {error}
        </p>
        {!busy && state.fb && <FeedbackCard feedback={state.fb} day={state.fbAt} />}
      </div>

      {!hasStrongAnswer && !aiOn && ai.phase !== "checking" && (
        <div className="strong-answer">
          <h3>Self-check</h3>
          <ul className="rubric">
            <li>Did you open with a direct answer, then add detail?</li>
            <li>Did you give one concrete example from your own work?</li>
            <li>Did you name at least one trade-off or failure mode?</li>
            <li>Could a non-expert follow it in under two minutes?</li>
          </ul>
        </div>
      )}

      {showAnswer && (
        <div className="strong-answer">
          {question.rubric?.length ? (
            <>
              <h3>What a strong answer covers</h3>
              <ul className="rubric">
                {question.rubric.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
          {question.answer ? (
            <>
              <h3>One way to say it</h3>
              <div className="prose compact">{question.answer}</div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
