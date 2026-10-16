import { parseLesson, type LessonModule } from "./parse-lesson";
import type { Lesson } from "./types";

// Every .mdx file in src/lessons is a lesson. Add a file and it shows up on the path.
const modules = import.meta.glob<LessonModule>("../lessons/*.mdx", { eager: true });

export const lessons: Lesson[] = Object.entries(modules)
  .map(([file, mod]) => parseLesson(file, mod))
  .sort((a, b) => a.n - b.n);

const ids = new Set<string>();
for (const lesson of lessons) {
  if (ids.has(lesson.id)) throw new Error(`Two lessons use the id "${lesson.id}". Ids must be unique.`);
  ids.add(lesson.id);
}

export const lessonById = new Map(lessons.map((l) => [l.id, l]));

export { extraQuestions } from "./extra-questions";
