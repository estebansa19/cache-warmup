// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { lessons } from "../src/content/lessons";
import { playerSteps } from "../src/content/types";
import { STORAGE_KEY } from "../src/state/storage";

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

  test("leaving by the path link doesn't finish it", async () => {
    await open(`#/lesson/${lesson.id}`, { pos: { [lesson.id]: lastStep } });
    await click(control(/Path/));

    expect(savedProgress().done[lesson.id]).toBeUndefined();
  });
});
