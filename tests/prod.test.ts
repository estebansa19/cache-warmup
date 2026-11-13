import { describe, expect, test } from "vitest";
import { lessons } from "../src/content/lessons";
import { normalize } from "../src/state/normalize";
import {
  BOOST,
  MAX_LEVEL,
  SERVERS,
  servedBy,
  stageInfo,
  throughput,
  upgradeCost,
  xpToSpend,
} from "../src/state/prod";
import { emptyProgress, reducer, type Progress } from "../src/state/progress";
import { cardKey, prodHealth } from "../src/state/selectors";

const DAY = "2026-10-15";
const NOW = 1_800_000_000_000;
const lesson = lessons[0];

function withXp(xp: number, extra: Partial<Progress> = {}): Progress {
  return { ...emptyProgress(), xp, ...extra };
}

const buy = (id: string, rps = 1, now = NOW) => ({ type: "buy", id, rps, now }) as const;

describe("spending XP in prod", () => {
  test("buying spends XP without touching the XP that sets your level", () => {
    const p = reducer(withXp(100), buy(SERVERS));

    expect(p.prod.owned[SERVERS]).toBe(1);
    expect(p.xp).toBe(100);
    expect(xpToSpend(p)).toBe(100 - upgradeCost(SERVERS, 0));
  });

  test("each level costs more than the last", () => {
    for (const id of [SERVERS, lesson.id]) {
      expect(upgradeCost(id, 1)).toBeGreaterThan(upgradeCost(id, 0));
    }
  });

  test("a lesson's upgrade stays locked until the lesson is finished", () => {
    const unfinished = withXp(500);
    expect(reducer(unfinished, buy(lesson.id))).toBe(unfinished);

    const finished = withXp(500, { done: { [lesson.id]: { at: DAY, correct: 1, total: 1 } } });
    expect(reducer(finished, buy(lesson.id)).prod.owned[lesson.id]).toBe(1);
  });

  test("you can't buy what you can't afford, or past the top level", () => {
    const broke = withXp(upgradeCost(SERVERS, 0) - 1);
    expect(reducer(broke, buy(SERVERS))).toBe(broke);

    const maxed = withXp(10_000, {
      done: { [lesson.id]: { at: DAY, correct: 1, total: 1 } },
      prod: { owned: { [lesson.id]: MAX_LEVEL }, served: 0, at: 0 },
    });
    expect(reducer(maxed, buy(lesson.id))).toBe(maxed);
  });

  test("buying counts what was served at the old speed first", () => {
    const running = withXp(100, { prod: { owned: {}, served: 50, at: NOW - 10_000 } });
    const p = reducer(running, buy(SERVERS, 3));

    expect(p.prod).toMatchObject({ served: 80, at: NOW });
  });
});

describe("throughput", () => {
  test("is machines × upgrades × cache", () => {
    const speed = throughput({ [SERVERS]: 4, bigo: 2 }, { cold: new Set(), warmth: 0.5 });
    expect(speed).toMatchObject({ base: 5, boost: BOOST ** 2, cache: 2 });
    expect(speed.rps).toBeCloseTo(5 * BOOST ** 2 * 2);
  });

  test("an upgrade whose lesson went cold is paged offline", () => {
    const owned = { bigo: 3 };
    expect(throughput(owned, { cold: new Set(["bigo"]), warmth: 0 }).rps).toBe(1);
  });

  test("stages are ten times apart", () => {
    expect(stageInfo(0).name).toBe("Laptop under the desk");
    expect(stageInfo(10).name).toBe("Side project");
    expect(stageInfo(316).percent).toBeCloseTo(50, 0);
    expect(stageInfo(1e12)).toMatchObject({ next: null, percent: 100 });
  });
});

describe("counting requests served", () => {
  test("nothing is served before prod boots, and opening it boots it", () => {
    const fresh = emptyProgress();
    expect(servedBy(fresh.prod, 100, NOW)).toBe(0);
    expect(reducer(fresh, { type: "bank", rps: 100, now: NOW }).prod).toMatchObject({ served: 0, at: NOW });
  });

  test("it accrues at rps while you're away, and a clock set back never takes requests away", () => {
    const prod = { owned: {}, served: 10, at: NOW };
    expect(servedBy(prod, 2, NOW + 60_000)).toBe(130);
    expect(servedBy(prod, 2, NOW - 60_000)).toBe(10);
  });
});

describe("prod's cache, read from your flashcards", () => {
  const keys = lesson.cards.map((card) => cardKey(lesson, card));
  const withCards = (box: number, due: string, done = true) =>
    withXp(0, {
      done: done ? { [lesson.id]: { at: DAY, correct: 1, total: 1 } } : {},
      cards: Object.fromEntries(keys.map((key) => [key, { box, due }])),
    });

  test("warms up as cards climb the tiers, and a due card is a miss", () => {
    expect(prodHealth(lessons, emptyProgress(), DAY).warmth).toBe(0);
    expect(prodHealth(lessons, withCards(0, "2026-10-16"), DAY).warmth).toBe(0.25);
    expect(prodHealth(lessons, withCards(3, "2026-10-20"), DAY).warmth).toBe(1);
    expect(prodHealth(lessons, withCards(3, DAY), DAY).warmth).toBe(0);
  });

  test("a finished lesson gone cold is paged", () => {
    expect(prodHealth(lessons, withCards(1, "2026-10-01"), DAY).cold).toEqual(new Set([lesson.id]));
    expect(prodHealth(lessons, withCards(1, "2026-10-20"), DAY).cold.size).toBe(0);
  });
});

describe("reading saved prod", () => {
  const legacy = new Map();

  test("progress saved before prod existed starts it fresh, with all its XP to spend", () => {
    const p = normalize({ v: 2, xp: 300 }, legacy)!;
    expect(p.prod).toEqual({ owned: {}, served: 0, at: 0 });
    expect(xpToSpend(p)).toBe(300);
  });

  test("broken levels are dropped and impossible ones capped", () => {
    const p = normalize(
      { v: 2, prod: { owned: { bigo: 99, ds: -1, http: "two", [SERVERS]: 3 }, served: -5, at: NOW } },
      legacy,
    )!;

    expect(p.prod).toEqual({ owned: { bigo: MAX_LEVEL, [SERVERS]: 3 }, served: 0, at: NOW });
  });
});
