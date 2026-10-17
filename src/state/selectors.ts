import { isCheck, playerSteps, type CheckStep, type Lesson } from "../content/types";
import type { LegacyKeys } from "./normalize";
import type { CheckResult, Progress } from "./progress";

/** Where a check's answer is saved. */
export function checkKey(lesson: Lesson, step: CheckStep) {
  return `${lesson.id}:${step.id}`;
}

/** Where a flashcard's schedule is saved. */
export function cardKey(lesson: Lesson, card: Lesson["cards"][number]) {
  return `${lesson.id}:${card.id}`;
}

/** Your answer to a check, if you gave one. An answer saved for a different kind of check doesn't count. */
export function resultFor(lesson: Lesson, step: CheckStep, progress: Progress): CheckResult | undefined {
  const result = progress.checks[checkKey(lesson, step)];
  return result?.kind === step.kind ? result : undefined;
}

/** Quick-check score for one lesson. */
export function lessonScore(lesson: Lesson, progress: Progress) {
  let total = 0;
  let correct = 0;

  for (const step of lesson.steps) {
    if (!isCheck(step)) continue;

    total++;
    if (resultFor(lesson, step, progress)?.ok) correct++;
  }

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

export type CardInfo = { lesson: Lesson; front: string; back: string };

/** Every flashcard by its saved key. */
export function cardsByKey(lessons: Lesson[]) {
  return new Map<string, CardInfo>(
    lessons.flatMap((lesson) =>
      lesson.cards.map(
        (card) => [cardKey(lesson, card), { lesson, front: card.front, back: card.back }] as const,
      ),
    ),
  );
}

/** How version 1 progress keys ("lessonId:position") map to today's keys. */
export function legacyKeys(lessons: Lesson[]): LegacyKeys {
  return new Map(
    lessons.map((lesson) => [
      lesson.id,
      {
        steps: playerSteps(lesson).map((step) =>
          isCheck(step) ? { key: checkKey(lesson, step), kind: step.kind } : null,
        ),
        cards: lesson.cards.map((card) => cardKey(lesson, card)),
      },
    ]),
  );
}
