import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LegacyKeys } from "../src/state/normalize";
import { STORAGE_KEY, UNREADABLE_KEY, loadProgress, readUnreadable } from "../src/state/storage";

// Loading saved progress from the browser's storage, with a small stand-in for localStorage.

const legacy: LegacyKeys = new Map();
let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("loading saved progress", () => {
  test("progress this version understands loads, and no copy is set aside", () => {
    stored.set(STORAGE_KEY, JSON.stringify({ v: 2, xp: 40 }));

    expect(loadProgress(legacy).xp).toBe(40);
    expect(readUnreadable()).toBeNull();
  });

  test.each([
    ["saved by a newer version", JSON.stringify({ v: 3, xp: 1234 })],
    ["damaged", "{not json"],
  ])("progress that was %s starts fresh, and a copy is kept as it was", (_why, saved) => {
    stored.set(STORAGE_KEY, saved);

    expect(loadProgress(legacy).xp).toBe(0);
    expect(stored.get(UNREADABLE_KEY)).toBe(saved);
  });

  test("with nothing saved there's nothing to set aside", () => {
    expect(loadProgress(legacy).xp).toBe(0);
    expect(readUnreadable()).toBeNull();
  });

  test("blocked storage starts fresh instead of crashing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });

    expect(loadProgress(legacy).xp).toBe(0);
    expect(readUnreadable()).toBeNull();
  });
});
