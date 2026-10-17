import { useState } from "react";
import { SCORE_LABELS } from "../ai/feedback";
import { InterviewRep, type InterviewQuestion } from "../components/InterviewRep";
import { extraQuestions, lessons } from "../content/lessons";
import type { InterviewState } from "../state/progress";
import { useProgress } from "../state/ProgressContext";
import { plural } from "../utils/text";
import "./Pages.css";

export function Gym() {
  const { progress } = useProgress();
  const [open, setOpen] = useState<string | null>(null);
  const reps = Object.values(progress.iv).filter((iv) => iv?.fb).length;

  function toggle(id: string) {
    setOpen(open === id ? null : id);
  }

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Interview gym · {plural(reps, "rep")} with feedback</p>
        <h1>Practice saying it out loud</h1>
        <p>
          Pick a question, write the answer you'd give in the room, and get a mock interviewer's read: a
          hire/no-hire signal, what landed, what was missing, and the follow-up they'd ask next. Questions
          from lessons you haven't done yet are fair game too.
        </p>
      </div>
      <section className="gym-group">
        <h2>From the lessons</h2>
        {lessons.map((l) => (
          <GymQuestion
            key={l.id}
            id={l.id}
            source={`Lesson ${l.n} · ${l.title}`}
            question={l.interview}
            open={open === l.id}
            onToggle={toggle}
          />
        ))}
      </section>
      <section className="gym-group">
        <h2>Extra reps</h2>
        {extraQuestions.map((x) => (
          <GymQuestion
            key={x.id}
            id={x.id}
            source={x.topic}
            question={{ question: x.q }}
            open={open === x.id}
            onToggle={toggle}
          />
        ))}
      </section>
    </>
  );
}

type GymQuestionProps = {
  id: string;
  source: string;
  question: InterviewQuestion;
  open: boolean;
  onToggle: (id: string) => void;
};

/** One question in the list; opening it shows the interview rep. */
function GymQuestion({ id, source, question, open, onToggle }: GymQuestionProps) {
  const { progress } = useProgress();

  return (
    <div className="gym-item">
      <button className="gym-toggle" aria-expanded={open} onClick={() => onToggle(id)}>
        <span>
          <span className="gym-question">{question.question}</span>
          <span className="gym-source">{source}</span>
        </span>
        <RepPill state={progress.iv[id]} />
      </button>
      {open && (
        <div className="gym-body">
          <InterviewRep id={id} question={question} />
        </div>
      )}
    </div>
  );
}

/** The last feedback's verdict, "draft", or nothing yet. */
function RepPill({ state }: { state: InterviewState | undefined }) {
  const score = state?.fb?.score;
  if (score) return <span className={`pill ${score >= 4 ? "done" : "progress"}`}>{SCORE_LABELS[score]}</span>;
  if (state?.draft) return <span className="pill">draft</span>;
  return null;
}
