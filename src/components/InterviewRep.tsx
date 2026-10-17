import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAI } from "../ai/AIContext";
import { AIError, type FeedbackRequest } from "../ai/client";
import { hrefFor } from "../router";
import { useProgress } from "../state/ProgressContext";
import { today } from "../utils/dates";
import { words } from "../utils/text";
import { FeedbackCard } from "./FeedbackCard";
import "./InterviewRep.css";

export type InterviewQuestion = { question: string; rubric?: string[] | null; answer?: ReactNode };

/** Below this, there's too little for the interviewer to react to. */
const MIN_WORDS_FOR_FEEDBACK = 25;

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
  const feedback = useFeedbackRequest(id);
  const [showAnswer, setShowAnswer] = useState(false);
  const stopButton = useRef<HTMLButtonElement>(null);
  const askButton = useRef<HTMLButtonElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const wasBusy = useRef(false);
  const { busy } = feedback;
  const state = progress.iv[id] ?? {};
  const draft = state.draft ?? "";
  const hasStrongAnswer = Boolean(question.answer || question.rubric?.length);
  const checking = ai.phase === "checking";
  const aiOn = Boolean(ai.status?.enabled);
  const aiOff = !checking && !aiOn;
  const canAsk = aiOn && !busy;

  // The feedback button is replaced while waiting: focus Stop, then whatever came back.
  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (busy) stopButton.current?.focus();
    if (!finished) return;

    const reply = result.current?.querySelector<HTMLElement>(".error-text:not(:empty), .feedback");
    if (reply) reply.tabIndex = -1;
    (reply ?? askButton.current)?.focus();
  }, [busy]);

  function askForFeedback() {
    feedback.ask({
      question: question.question,
      rubric: question.rubric ?? null,
      answer: draft,
      profile: progress.profile,
    });
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
        {canAsk && (
          <button className="btn" ref={askButton} onClick={askForFeedback}>
            {state.fb ? "Get fresh feedback" : "Get interviewer feedback"}
          </button>
        )}
        {checking && (
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

      {aiOff && (
        <p className="muted">
          AI feedback is off, so compare with the strong answer for now.{" "}
          <a href={hrefFor({ view: "settings" })}>Turn on AI feedback</a> (about a minute).
        </p>
      )}
      {canAsk && ai.status?.active && (
        <p className="muted">
          Feedback comes from {ai.status.active.label}, using {ai.status.active.usage}.
        </p>
      )}

      {busy && (
        <div className="thinking">
          <span className="pulse" />
          <span aria-hidden="true">The interviewer is reading your answer…</span>
          <button className="btn ghost small" ref={stopButton} onClick={feedback.stop}>
            Stop
          </button>
        </div>
      )}
      <p role="status" className="live sr-only">
        {announcement(feedback)}
      </p>
      <div ref={result}>
        <p role="alert" className="error-text live">
          {feedback.error}
        </p>
        {!busy && state.fb && <FeedbackCard feedback={state.fb} day={state.fbAt} />}
      </div>

      {!hasStrongAnswer && aiOff && <SelfCheck />}
      {showAnswer && <StrongAnswer question={question} />}
    </div>
  );
}

/** The rubric and a model answer, when the question has them. */
function StrongAnswer({ question }: { question: InterviewQuestion }) {
  return (
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
  );
}

/** Generic questions to grade yourself with, when there's no strong answer and no AI. */
function SelfCheck() {
  return (
    <div className="strong-answer">
      <h3>Self-check</h3>
      <ul className="rubric">
        <li>Did you open with a direct answer, then add detail?</li>
        <li>Did you give one concrete example from your own work?</li>
        <li>Did you name at least one trade-off or failure mode?</li>
        <li>Could a non-expert follow it in under two minutes?</li>
      </ul>
    </div>
  );
}

/**
 * Sends an answer to the AI interviewer and saves the feedback. Leaving the question (or the
 * page) stops the request, so the AI tool stops too.
 */
function useFeedbackRequest(id: string) {
  const { dispatch } = useProgress();
  const ai = useAI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  async function ask(request: FeedbackRequest) {
    if (words(request.answer) < MIN_WORDS_FOR_FEEDBACK) {
      setError("Write a bit more first. A few sentences gives the interviewer something to react to.");
      return;
    }

    setError(null);
    setDone(false);
    setBusy(true);
    abort.current = new AbortController();

    try {
      const feedback = await ai.ask(request, abort.current.signal);
      dispatch({ type: "feedback", key: id, feedback, today: today() });
      setDone(true);
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError("unreachable");
      if (err.code !== "cancelled") setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, done, ask, stop: () => abort.current?.abort() };
}

/** What the screen reader hears about the request. */
function announcement({ busy, done }: { busy: boolean; done: boolean }) {
  if (busy) return "The interviewer is reading your answer.";
  return done ? "Feedback is ready." : "";
}

function errorText(error: AIError): string {
  return ERRORS[error.code] ?? `The AI tool reported a problem: ${error.message}`;
}
