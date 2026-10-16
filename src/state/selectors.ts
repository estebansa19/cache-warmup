import { isCheck, playerSteps, type Lesson } from "../content/types";
import type { Progress } from "./progress";

/** Quick-check score for one lesson. */
export function lessonScore(lesson: Lesson, progress: Progress) {
  let total = 0;
  let correct = 0;
  playerSteps(lesson).forEach((step, i) => {
    if (!isCheck(step)) return;
    total++;
    if (progress.checks[`${lesson.id}:${i}`]?.ok) correct++;
  });
  return { total, correct };
}

export type LessonStatus = "new" | "in-progress" | "done";

export function lessonStatus(lesson: Lesson, progress: Progress): LessonStatus {
  if (progress.done[lesson.id]) return "done";
  return (progress.pos[lesson.id] ?? 0) > 0 ? "in-progress" : "new";
}

/** The lesson to suggest next: the one you were in, or the first unfinished one. */
export function nextLesson(lessons: Lesson[], progress: Progress): Lesson | null {
  const last = progress.last ? lessons.find((l) => l.id === progress.last) : undefined;
  if (last && !progress.done[last.id]) return last;
  return lessons.find((l) => !progress.done[l.id]) ?? null;
}

/** The flashcard behind a "lessonId:index" key. */
export function cardFor(key: string, lessons: Map<string, Lesson>) {
  const [id, index] = key.split(":");
  const lesson = lessons.get(id);
  const card = lesson?.cards[Number(index)];
  return lesson && card ? { lesson, front: card[0], back: card[1] } : null;
}
