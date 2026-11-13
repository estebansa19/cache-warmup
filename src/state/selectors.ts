import { isCheck, playerSteps, type CheckStep, type Lesson } from "../content/types";
import type { LegacyKeys } from "./normalize";
import type { CheckResult, Progress } from "./progress";
import { isDue } from "./srs";
import { addDays, type Day } from "../utils/dates";

/** From this average tier up (L2 and L1), a lesson with nothing due counts as hot. */
const HOT_TIER = 2;

/** A lesson with a card overdue for this long has gone cold. */
const COLD_AFTER_DAYS = 7;

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

export type TraceState = "hit" | "miss" | "rewarmed" | "missed-twice" | "unanswered";

/** How a check went: right the first time, missed, or missed and then retried from the warm-up trace. */
export function traceState(result: CheckResult | undefined): TraceState {
  if (!result) return "unanswered";
  if (result.ok) return "hit";
  if (result.rewarm === undefined) return "miss";
  return result.rewarm ? "rewarmed" : "missed-twice";
}

/** A lesson's checks in order, each with how it went. */
export function lessonTrace(lesson: Lesson, progress: Progress) {
  return lesson.steps
    .filter(isCheck)
    .map((step) => ({ step, state: traceState(resultFor(lesson, step, progress)) }));
}

export type Temperature = "hot" | "warm" | "cooling" | "cold";

/**
 * How fresh a finished lesson is, read from its flashcards: warm while none is due (hot once
 * they sit in the top tiers), cooling when some are due, cold when one has waited a week.
 */
export function lessonTemperature(
  lesson: Lesson,
  progress: Progress,
  now: Day,
): { temperature: Temperature; due: number } {
  const cards = lesson.cards.flatMap((card) => progress.cards[cardKey(lesson, card)] ?? []);
  const due = cards.filter((card) => isDue(card, now));
  const longOverdue = addDays(now, -COLD_AFTER_DAYS);

  if (due.some((card) => card.due <= longOverdue)) return { temperature: "cold", due: due.length };
  if (due.length) return { temperature: "cooling", due: due.length };

  const tier = cards.reduce((sum, card) => sum + card.box, 0) / Math.max(1, cards.length);
  return { temperature: tier >= HOT_TIER ? "hot" : "warm", due: 0 };
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
