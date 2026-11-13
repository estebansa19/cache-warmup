import { describe, expect, test } from "vitest";
import { lessons } from "../src/content/lessons";
import { XP, levelInfo, streak } from "../src/state/levels";
import { normalize, type LegacyKeys } from "../src/state/normalize";
import { emptyProgress, reducer, type Action } from "../src/state/progress";
import { cardKey, lessonTemperature, traceState } from "../src/state/selectors";
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
    const answer = {
      type: "answer",
      key: "bigo:q1",
      result: { kind: "quiz", ok: true, pick: 1 },
      today: DAY,
    } as const;

    const p = reducer(reducer(start, answer), answer);
    expect(p.xp).toBe(XP.check);
    expect(p.days).toEqual([DAY]);
  });

  test("an old answer saved for a different kind of check doesn't block a new one", () => {
    const old = { ...start, checks: { "bigo:q1": { kind: "myth" as const, ok: false, pick: true } } };
    const p = reducer(old, {
      type: "answer",
      key: "bigo:q1",
      result: { kind: "quiz", ok: true, pick: 0 },
      today: DAY,
    });

    expect(p.checks["bigo:q1"]).toEqual({ kind: "quiz", ok: true, pick: 0 });
  });

  test("a missed check can be re-warmed once, for part of the XP, and stays a miss on record", () => {
    const missed = reducer(start, {
      type: "answer",
      key: "bigo:q1",
      result: { kind: "quiz", ok: false, pick: 2 },
      today: DAY,
    });

    const rewarm = { type: "rewarm", key: "bigo:q1", ok: true, today: DAY } as const;
    const once = reducer(missed, rewarm);
    expect(once.checks["bigo:q1"]).toMatchObject({ ok: false, rewarm: true });
    expect(once.xp).toBe(XP.rewarm);
    expect(traceState(once.checks["bigo:q1"])).toBe("rewarmed");
    expect(reducer(once, rewarm)).toBe(once);

    const missedAgain = reducer(missed, { ...rewarm, ok: false });
    expect(missedAgain.xp).toBe(0);
    expect(traceState(missedAgain.checks["bigo:q1"])).toBe("missed-twice");
    expect(reducer(missedAgain, rewarm)).toBe(missedAgain);
  });

  test("a check you got right, or never answered, can't be re-warmed", () => {
    const hit = reducer(start, {
      type: "answer",
      key: "bigo:q1",
      result: { kind: "quiz", ok: true, pick: 1 },
      today: DAY,
    });

    expect(reducer(hit, { type: "rewarm", key: "bigo:q1", ok: true, today: DAY })).toBe(hit);
    expect(reducer(start, { type: "rewarm", key: "bigo:q1", ok: true, today: DAY })).toBe(start);
  });

  test("finishing a lesson adds its cards once and awards XP once", () => {
    const finish: Action = {
      type: "finish",
      lessonId: "bigo",
      correct: 3,
      total: 4,
      cardKeys: ["bigo:ca", "bigo:cb"],
      today: DAY,
    };

    const p = reducer(reducer(start, finish), finish);
    expect(Object.keys(p.cards)).toEqual(["bigo:ca", "bigo:cb"]);
    expect(p.xp).toBe(XP.lesson);
  });

  test("opening a lesson remembers it, and restarts a finished one left on its last step", () => {
    const done = { ...start, done: { bigo: { at: DAY, correct: 1, total: 1 } } };

    expect(reducer(start, { type: "open", lessonId: "bigo", lastStep: 9 })).toMatchObject({
      last: "bigo",
      pos: {},
    });

    const atEnd = { ...done, pos: { bigo: 9 } };
    expect(reducer(atEnd, { type: "open", lessonId: "bigo", lastStep: 9 }).pos.bigo).toBe(0);

    const midway = { ...done, pos: { bigo: 4 } };
    expect(reducer(midway, { type: "open", lessonId: "bigo", lastStep: 9 }).pos.bigo).toBe(4);

    const unfinished = { ...start, pos: { bigo: 9 } };
    expect(reducer(unfinished, { type: "open", lessonId: "bigo", lastStep: 9 }).pos.bigo).toBe(9);
  });

  test("moving never goes below the first step", () => {
    expect(reducer(start, { type: "move", lessonId: "bigo", pos: 3 }).pos.bigo).toBe(3);
    expect(reducer(start, { type: "move", lessonId: "bigo", pos: -2 }).pos.bigo).toBe(0);
  });

  test("revealing the strong answer earns interview XP only after a real attempt", () => {
    const short = reducer(start, { type: "draft", key: "bigo", text: "too short" });
    expect(reducer(short, { type: "revealAnswer", key: "bigo", today: DAY }).xp).toBe(0);

    const long = reducer(start, { type: "draft", key: "bigo", text: "word ".repeat(45) });
    expect(reducer(long, { type: "revealAnswer", key: "bigo", today: DAY }).xp).toBe(XP.interview);
  });
});

describe("a finished lesson's temperature", () => {
  const lesson = lessons[0];
  const keys = lesson.cards.map((card) => cardKey(lesson, card));
  const withCards = (box: number, due: string) => ({
    ...emptyProgress(),
    cards: Object.fromEntries(keys.map((key) => [key, { box, due }])),
  });

  test("is warm while nothing is due, and hot once its cards sit in the top tiers", () => {
    expect(lessonTemperature(lesson, withCards(0, "2026-10-16"), DAY)).toEqual({
      temperature: "warm",
      due: 0,
    });
    expect(lessonTemperature(lesson, withCards(2, "2026-10-20"), DAY)).toEqual({
      temperature: "hot",
      due: 0,
    });
  });

  test("cools when cards come due, and goes cold after a week of waiting", () => {
    expect(lessonTemperature(lesson, withCards(1, DAY), DAY)).toEqual({
      temperature: "cooling",
      due: keys.length,
    });
    expect(lessonTemperature(lesson, withCards(3, "2026-10-09"), DAY).temperature).toBe("cooling");
    expect(lessonTemperature(lesson, withCards(3, "2026-10-08"), DAY).temperature).toBe("cold");
  });

  test("one long-overdue card is enough to go cold", () => {
    const progress = withCards(2, "2026-10-20");
    progress.cards[keys[0]] = { box: 0, due: "2026-10-01" };

    expect(lessonTemperature(lesson, progress, DAY)).toEqual({ temperature: "cold", due: 1 });
  });
});

describe("reading saved and imported progress", () => {
  // Version 1 keys were positions: player step 2 is a quiz, step 3 a myth; cards 0 and 1.
  const legacy: LegacyKeys = new Map([
    [
      "bigo",
      {
        steps: [null, null, { key: "bigo:qabc", kind: "quiz" }, { key: "bigo:mdef", kind: "myth" }, null],
        cards: ["bigo:c1", "bigo:c2"],
      },
    ],
  ]);

  test("rejects anything that isn't progress", () => {
    expect(normalize({ hello: "world" }, legacy)).toBeNull();
    expect(normalize(null, legacy)).toBeNull();
    expect(normalize({ v: 7 }, legacy)).toBeNull();
  });

  test("moves version 1 position keys to stable ids, once", () => {
    const v1 = {
      v: 1,
      xp: 120,
      done: { bigo: { at: DAY, correct: 5, total: 6 } },
      checks: {
        "bigo:2": { ok: true, pick: 1 },
        "bigo:3": { ok: false, pick: true },
        "bigo:1": { ok: true },
        "gone:2": { ok: true },
      },
      cards: {
        "bigo:0": { box: 2, due: DAY },
        "bigo:1": { box: 0, due: DAY },
        "bigo:7": { box: 0, due: DAY },
      },
    };

    const p = normalize(v1, legacy)!;
    expect(p).toMatchObject({ v: 2, xp: 120, profile: "" });
    expect(p.checks).toEqual({
      "bigo:qabc": { kind: "quiz", ok: true, pick: 1 },
      "bigo:mdef": { kind: "myth", ok: false, pick: true },
    });

    expect(p.cards).toEqual({ "bigo:c1": { box: 2, due: DAY }, "bigo:c2": { box: 0, due: DAY } });
    // Normalizing the result again changes nothing.
    expect(normalize(JSON.parse(JSON.stringify(p)), legacy)).toEqual(p);
  });

  test("drops broken entries but keeps the rest of the file", () => {
    const p = normalize(
      {
        v: 2,
        xp: "lots",
        days: [DAY, 42, "yesterday"],
        cards: { "bigo:c1": null, "bigo:c2": { box: 9, due: DAY }, "bigo:c3": { box: 1, due: "soon" } },
        checks: {
          "bigo:qabc": { kind: "quiz", ok: true },
          "bigo:mdef": { kind: "myth", ok: false, rewarm: true },
          "bigo:x": "yes",
          "bigo:y": { ok: true },
        },
        done: { bigo: { at: DAY, correct: 1, total: 2 }, other: { at: 5 } },
        pos: { bigo: 3, other: -1, third: "two" },
        iv: { bigo: { draft: "my answer", fb: { score: 99 } }, x: null },
        last: 12,
        profile: ["not text"],
      },
      legacy,
    )!;

    expect(p.xp).toBe(0);
    expect(p.days).toEqual([DAY]);
    expect(p.cards).toEqual({ "bigo:c2": { box: 3, due: DAY } }); // an impossible tier is clamped
    expect(p.checks).toEqual({
      "bigo:qabc": { kind: "quiz", ok: true },
      "bigo:mdef": { kind: "myth", ok: false, rewarm: true },
    });

    expect(p.done).toEqual({ bigo: { at: DAY, correct: 1, total: 2 } });
    expect(p.pos).toEqual({ bigo: 3 });
    expect(p.iv.bigo).toMatchObject({ draft: "my answer" });
    expect(p.iv.bigo.fb).toBeUndefined();
    expect(p.iv.x).toBeUndefined();
    expect(p.last).toBeNull();
    expect(p.profile).toBe("");
  });
});
