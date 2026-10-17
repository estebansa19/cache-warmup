import { cardsByKey, legacyKeys } from "../state/selectors";
import { parseLesson, type LessonModule } from "./parse-lesson";
import type { Lesson } from "./types";

// Every .mdx file in src/lessons is a lesson. Add a file and it shows up on the path.
const modules = import.meta.glob<LessonModule>("../lessons/*.mdx", { eager: true });

export const lessons: Lesson[] = Object.entries(modules)
  .map(([file, mod]) => parseLesson(file, mod))
  .sort((a, b) => a.n - b.n);

assertUniqueIds(lessons);

export const lessonById = new Map(lessons.map((l) => [l.id, l]));

/** Every flashcard, by the key its schedule is saved under. */
export const cardByKey = cardsByKey(lessons);

/** For upgrading progress saved by version 1 of the app. */
export const legacy = legacyKeys(lessons);

export { extraQuestions } from "./extra-questions";

/** Whether a saved card still exists (its lesson or card may have been removed since). */
export function isKnownCard(key: string) {
  return cardByKey.has(key);
}

function assertUniqueIds(list: Lesson[]) {
  const ids = new Set<string>();

  for (const lesson of list) {
    if (ids.has(lesson.id)) throw new Error(`Two lessons use the id "${lesson.id}". Ids must be unique.`);
    ids.add(lesson.id);
  }
}
