// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { extraQuestions, lessons } from "../src/content/lessons";
import { playerSteps, type MythStep } from "../src/content/types";
import { cardKey } from "../src/state/selectors";
import { XP } from "../src/state/levels";
import { upgradeCost } from "../src/state/prod";
import { STORAGE_KEY } from "../src/state/storage";
import { upgradeFor } from "../src/content/upgrades";

// Whole screens in a browser-like page: what you can click, and what gets saved when you do.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let page: HTMLElement;

beforeEach(() => {
  // No AI server: every request fails, like on a static host.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline"))),
  );
});

afterEach(() => {
  act(() => root.unmount());
  page.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** Opens the app at `hash` with `saved` as the stored progress. */
async function open(hash: string, saved: object = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, ...saved }));
  window.location.hash = hash;
  page = document.body.appendChild(document.createElement("div"));
  root = createRoot(page);
  await act(async () => root.render(createElement(App)));
}

function control(label: RegExp, within: ParentNode = page) {
  return [...within.querySelectorAll<HTMLElement>("button, a")].find((el) =>
    label.test(el.textContent ?? ""),
  );
}

async function click(element: HTMLElement | undefined) {
  expect(element).toBeDefined();
  await act(async () => element!.click());
}

/** Presses `key` with nothing focused, the way a keyboard shortcut usually arrives. */
async function press(key: string) {
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key })));
}

/** What's in storage once the app has saved (leaving the page saves right away). */
function savedProgress() {
  window.dispatchEvent(new Event("pagehide"));
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

describe("finishing a lesson", () => {
  const lesson = lessons[0];
  const lastStep = playerSteps(lesson).length - 1;

  test("the last step's way forward finishes the lesson and adds its cards", async () => {
    await open(`#/lesson/${lesson.id}`, { pos: { [lesson.id]: lastStep } });

    const forward = [...page.querySelectorAll<HTMLElement>(".player-nav button, .player-nav a")].at(-1);
    expect(forward?.textContent).toMatch(/Finish lesson/);
    await click(forward);

    const saved = savedProgress();
    expect(saved.done[lesson.id]).toBeDefined();
    expect(Object.keys(saved.cards)).toHaveLength(lesson.cards.length);
    expect(control(/Back to the path/)).toBeDefined();
  });

  test("finishing shows the warm-up trace, where a missed check can be re-warmed", async () => {
    const myth = lesson.steps.find((step): step is MythStep => step.kind === "myth")!;
    const key = `${lesson.id}:${myth.id}`;

    await open(`#/lesson/${lesson.id}`, {
      pos: { [lesson.id]: lastStep },
      checks: { [key]: { kind: "myth", ok: false, pick: !myth.fact } },
    });

    await click(control(/Finish lesson/));
    expect(page.textContent).toContain("Warm-up trace");

    await click(control(/Re-warm/));
    await click(control(myth.fact ? /^Fact$/ : /^Myth$/));

    expect(savedProgress()).toMatchObject({
      xp: XP.lesson + XP.rewarm,
      checks: { [key]: { ok: false, rewarm: true } },
    });
    expect(control(/Re-warm/)).toBeUndefined();
  });

  test("leaving by the path link doesn't finish it", async () => {
    await open(`#/lesson/${lesson.id}`, { pos: { [lesson.id]: lastStep } });
    await click(control(/Path/));

    expect(savedProgress().done[lesson.id]).toBeUndefined();
  });
});

describe("prod", () => {
  const [first, second] = lessons;
  const finished = { [first.id]: { at: "2026-10-15", correct: 1, total: 1 } };

  test("finishing a lesson unlocks its upgrade, and XP installs it", async () => {
    await open("#/prod", { xp: 100, done: finished });
    const [, firstUnit, secondUnit] = page.querySelectorAll<HTMLElement>(".unit");

    expect(control(new RegExp(`Lesson ${second.n}`), secondUnit)).toBeDefined();
    await click(control(/Install/, firstUnit));

    const saved = savedProgress();
    expect(saved.prod.owned).toEqual({ [first.id]: 1 });
    expect(saved.prod.at).toBeGreaterThan(0); // opening prod booted it
    expect(saved.xp).toBe(100);
    expect(control(/Upgrade/, firstUnit)?.textContent).toContain(`${upgradeCost(first.id, 1)} XP`);
  });

  test("the diagram fills in when you buy from it", async () => {
    await open("#/prod", { xp: 100, done: finished });
    const box = page.querySelector<SVGElement>(".map-node.empty[role=button]");
    expect(page.querySelectorAll(".map-node.locked")).toHaveLength(lessons.length - 1);

    await act(async () => box!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(box!.classList.contains("running")).toBe(true);
    expect(savedProgress().prod.owned).toEqual({ [first.id]: 1 });
  });

  test("the warm-up trace says what a finished lesson unlocked", async () => {
    await open(`#/lesson/${first.id}`, { pos: { [first.id]: playerSteps(first).length - 1 } });
    await click(control(/Finish lesson/));

    expect(page.textContent).toContain(`Unlocked in prod: ${upgradeFor(first).name}`);
  });
});

describe("an interview question with no strong answer, without AI", () => {
  const question = extraQuestions[0];
  const draft = "word ".repeat(45);

  test("checking your answer yourself completes the rep", async () => {
    await open("#/gym", { iv: { [question.id]: { draft } } });
    await click(
      [...page.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(question.q)),
    );
    await click(control(/Check it yourself/));

    expect(page.textContent).toContain("Self-check");
    expect(savedProgress()).toMatchObject({ xp: XP.interview, iv: { [question.id]: { xp: true } } });
  });
});

describe("keyboard shortcuts", () => {
  const lesson = lessons[0];
  const quizAt = playerSteps(lesson).findIndex((step) => step.kind === "quiz");

  test("Enter moves to the next step, and the letter on an option picks that option", async () => {
    await open(`#/lesson/${lesson.id}`, { pos: { [lesson.id]: quizAt - 1 } });
    await press("Enter");
    expect(page.textContent).toContain("Quick check");

    const options = [...page.querySelectorAll(".options .option")];
    const labeledB = options.findIndex((option) => option.querySelector(".option-key")?.textContent === "B");
    await press("b");

    expect(page.querySelector(".verdict")).not.toBeNull();
    expect(options[labeledB].className).toMatch(/right|wrong/);
    expect(options.filter((option) => /wrong/.test(option.className)).length).toBeLessThanOrEqual(1);
  });

  test("Enter waits while a check is unanswered", async () => {
    await open(`#/lesson/${lesson.id}`, { pos: { [lesson.id]: quizAt } });
    await press("Enter");

    expect(savedProgress().pos[lesson.id]).toBe(quizAt);
  });

  test("in review, Space shows the answer and 2 means you got it", async () => {
    const key = cardKey(lesson, lesson.cards[0]);
    await open("#/review", { cards: { [key]: { box: 0, due: "2026-01-01" } } });
    await click(control(/Start review/));

    await press(" ");
    expect(page.querySelector(".card-back")).not.toBeNull();

    await press("2");
    expect(savedProgress().cards[key].box).toBe(1);
  });
});

describe("appearance", () => {
  test("a theme picked in Settings applies right away and is there on the next visit", async () => {
    await open("#/settings");
    await act(async () => page.querySelector<HTMLInputElement>("input[name=theme][value=dark]")!.click());
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => root.unmount());
    delete document.documentElement.dataset.theme;
    page.remove();
    await open("#/settings");

    expect(page.querySelector<HTMLInputElement>("input[name=theme][value=dark]")!.checked).toBe(true);
    await act(async () => page.querySelector<HTMLInputElement>("input[name=theme][value=system]")!.click());
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
