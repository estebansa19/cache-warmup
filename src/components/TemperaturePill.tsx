import type { Lesson } from "../content/types";
import { useProgress } from "../state/ProgressContext";
import { lessonTemperature } from "../state/selectors";
import { today } from "../utils/dates";

/** A finished lesson's temperature: "warm", "hot", or "cooling · 3 due" once its cards need a review. */
export function TemperaturePill({ lesson }: { lesson: Lesson }) {
  const { progress } = useProgress();
  const { temperature, due } = lessonTemperature(lesson, progress, today());

  return <span className={`pill ${temperature}`}>{due ? `${temperature} · ${due} due` : temperature}</span>;
}
