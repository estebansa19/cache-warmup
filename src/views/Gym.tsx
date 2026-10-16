import { useState } from "react";
import { SCORE_LABELS } from "../ai/feedback";
import { InterviewRep, type InterviewQuestion } from "../components/InterviewRep";
import { extraQuestions, lessons } from "../content/lessons";
import { useProgress } from "../state/ProgressContext";
import "./Pages.css";

export function Gym() {
  const { progress } = useProgress();
  const [open, setOpen] = useState<string | null>(null);
  const reps = Object.values(progress.iv).filter((iv) => iv?.fb).length;

  const row = (id: string, question: string, source: string, rep: InterviewQuestion) => {
    const state = progress.iv[id];
    const score = state?.fb?.score;
    return (
      <div className="gym-item" key={id}>
        <button
          className="gym-toggle"
          aria-expanded={open === id}
          onClick={() => setOpen(open === id ? null : id)}
        >
          <span>
            <span className="gym-question">{question}</span>
            <span className="gym-source">{source}</span>
          </span>
          {score ? (
            <span className={`pill ${score >= 4 ? "done" : "progress"}`}>{SCORE_LABELS[score]}</span>
          ) : state?.draft ? (
            <span className="pill">draft</span>
          ) : null}
        </button>
        {open === id && (
          <div className="gym-body">
            <InterviewRep id={id} question={rep} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">
          Interview gym · {reps} rep{reps === 1 ? "" : "s"} with feedback
        </p>
        <h1>Practice saying it out loud</h1>
        <p>
          Pick a question, write the answer you'd give in the room, and get a mock interviewer's read: a
          hire/no-hire signal, what landed, what was missing, and the follow-up they'd ask next. Questions
          from lessons you haven't done yet are fair game too.
        </p>
      </div>
      <section className="gym-group">
        <h2>From the lessons</h2>
        {lessons.map((l) => row(l.id, l.interview.question, `Lesson ${l.n} · ${l.title}`, l.interview))}
      </section>
      <section className="gym-group">
        <h2>Extra reps</h2>
        {extraQuestions.map((x) => row(x.id, x.q, x.topic, { question: x.q }))}
      </section>
    </>
  );
}
