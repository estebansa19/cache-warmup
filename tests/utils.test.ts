import { describe, expect, test } from "vitest";
import { hrefFor, parseRoute } from "../src/router";
import { scrambledIndexes, shuffledIndexes } from "../src/utils/shuffle";

describe("parseRoute", () => {
  test("reads every view", () => {
    expect(parseRoute("")).toEqual({ view: "home" });
    expect(parseRoute("#/")).toEqual({ view: "home" });
    expect(parseRoute("#/review")).toEqual({ view: "review" });
    expect(parseRoute("#/settings")).toEqual({ view: "settings" });
    expect(parseRoute("#/lesson/big-o")).toEqual({ view: "lesson", id: "big-o" });
  });

  test("round-trips through hrefFor", () => {
    const route = { view: "lesson", id: "a b/c" } as const;
    expect(parseRoute(hrefFor(route))).toEqual(route);
  });

  test("malformed or unknown hashes go home instead of throwing", () => {
    expect(parseRoute("#/lesson/%E0%A4%A")).toEqual({ view: "home" });
    expect(parseRoute("#/lesson/")).toEqual({ view: "home" });
    expect(parseRoute("#/nowhere")).toEqual({ view: "home" });
  });
});

describe("shuffling", () => {
  test("the same seed gives the same order", () => {
    expect(shuffledIndexes(6, "seed")).toEqual(shuffledIndexes(6, "seed"));
    expect([...shuffledIndexes(6, "seed")].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("scrambledIndexes never returns the original order for 2 or more items", () => {
    for (let n = 2; n <= 8; n++) {
      for (let seed = 0; seed < 300; seed++) {
        const order = scrambledIndexes(n, `lesson:${seed}`);
        expect([...order].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
        expect(order.every((v, i) => v === i)).toBe(false);
      }
    }
  });
});
