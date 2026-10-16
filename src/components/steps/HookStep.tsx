import type { Lesson } from "../../content/types";

export function HookStep({ lesson }: { lesson: Lesson }) {
  const reads = lesson.steps.filter((s) => s.kind === "read").length;
  const checks = lesson.steps.length - reads;
  return (
    <>
      <span className="eyebrow">
        {lesson.track} · ~{lesson.mins} min
      </span>
      <div className="hook-number" aria-hidden="true">
        {String(lesson.n).padStart(2, "0")}
      </div>
      <h2 className="hook-title">{lesson.title}</h2>
      <div className="hook-text">{lesson.hook}</div>
      <div className="row">
        <span className="pill">{reads} short reads</span>
        <span className="pill">{checks} quick checks</span>
        <span className="pill">1 interview rep</span>
        <span className="pill">{lesson.cards.length} flashcards</span>
      </div>
    </>
  );
}
