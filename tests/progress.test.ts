import { describe, expect, test } from "vitest";
import { XP, levelInfo, streak } from "../src/state/levels";
import { emptyProgress, normalize, reducer, type Progress } from "../src/state/progress";
import { dueCardKeys, newCard, reviewCard } from "../src/state/srs";

const DAY = "2026-10-15";

describe("spaced repetition", () => {
  test("new cards are due tomorrow", () => {
    expect(newCard(DAY)).toEqual({ box: 0, due: "2026-10-16" });
  });
  test("remembering moves a card up a tier and spaces it out", () => {
    expect(reviewCard({ box: 0, due: DAY }, true, DAY)).toEqual({ box: 1, due: "2026-10-18" });
    expect(reviewCard({ box: 2, due: DAY }, true, DAY)).toEqual({ box: 3, due: "2026-10-31" });
    expect(reviewCard({ box: 3, due: DAY }, true, DAY).box).toBe(3);
  });
  test("forgetting sends it back to disk", () => {
    expect(reviewCard({ box: 3, due: DAY }, false, DAY)).toEqual({ box: 0, due: "2026-10-16" });
  });
  test("due cards come oldest first", () => {
    const cards = {
      a: { box: 1, due: "2026-10-14" },
      b: { box: 0, due: "2026-10-10" },
      c: { box: 0, due: "2026-10-20" },
    };
    expect(dueCardKeys(cards, DAY)).toEqual(["b", "a"]);
  });
});

describe("levels and streaks", () => {
  test("levels follow XP thresholds", () => {
    expect(levelInfo(0).name).toBe("Intern");
    expect(levelInfo(150).name).toBe("Junior");
    expect(levelInfo(5000)).toMatchObject({ name: "Distinguished", next: null, percent: 100 });
  });
  test("a streak counts back from today, or from yesterday if today is empty", () => {
    expect(streak(["2026-10-13", "2026-10-14", DAY], DAY)).toBe(3);
    expect(streak(["2026-10-13", "2026-10-14"], DAY)).toBe(2);
    expect(streak(["2026-10-12"], DAY)).toBe(0);
  });
});

describe("progress reducer", () => {
  const start = emptyProgress();

  test("only the first answer to a check counts", () => {
    let p = reducer(start, { type: "answer", key: "bigo:2", result: { ok: true, pick: 1 }, today: DAY });
    p = reducer(p, { type: "answer", key: "bigo:2", result: { ok: true, pick: 1 }, today: DAY });
    expect(p.xp).toBe(XP.check);
    expect(p.days).toEqual([DAY]);
  });

  test("finishing a lesson adds its cards once and awards XP once", () => {
    const finish = {
      type: "finish",
      lessonId: "bigo",
      correct: 3,
      total: 4,
      cardCount: 2,
      today: DAY,
    } as const;
    const p = reducer(reducer(start, finish), finish);
    expect(Object.keys(p.cards)).toEqual(["bigo:0", "bigo:1"]);
    expect(p.xp).toBe(XP.lesson);
  });

  test("revealing the strong answer earns interview XP only after a real attempt", () => {
    const short = reducer(start, { type: "draft", key: "bigo", text: "too short" });
    expect(reducer(short, { type: "revealAnswer", key: "bigo", today: DAY }).xp).toBe(0);
    const long = reducer(start, { type: "draft", key: "bigo", text: "word ".repeat(45) });
    expect(reducer(long, { type: "revealAnswer", key: "bigo", today: DAY }).xp).toBe(XP.interview);
  });

  test("normalize accepts version 1 exports and rejects anything else", () => {
    const old: Partial<Progress> = { v: 1, xp: 120, done: { bigo: { at: DAY, correct: 5, total: 6 } } };
    expect(normalize(old)).toMatchObject({ xp: 120, profile: "", cards: {} });
    expect(normalize({ hello: "world" })).toBeNull();
    expect(normalize(null)).toBeNull();
  });
});
