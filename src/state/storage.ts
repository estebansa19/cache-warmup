import { today } from "../utils/dates";
import { normalize, type LegacyKeys } from "./normalize";
import { emptyProgress, type Progress } from "./progress";

/*
 * Progress in localStorage. Every access is wrapped: storage can be blocked (private
 * mode, strict settings) or full, and the app keeps working for the visit either way.
 */

/** Unchanged since version 1, so existing progress is found and upgraded in place. */
export const STORAGE_KEY = "cache-warmup:v1";

/** Where saved progress goes when this version can't read it, so the next save doesn't destroy it. */
export const UNREADABLE_KEY = "cache-warmup:unreadable";

/**
 * Parses the stored (or another tab's) JSON. Progress this version can't read (damaged, or
 * saved by a newer version) is set aside under UNREADABLE_KEY, and you start fresh.
 */
export function parseStored(json: string | null, legacy: LegacyKeys): Progress {
  const progress = readProgress(json, legacy);
  if (json !== null && !progress) keepUnreadable(json);
  return progress ?? emptyProgress();
}

function readProgress(json: string | null, legacy: LegacyKeys): Progress | null {
  try {
    return normalize(JSON.parse(json ?? "null"), legacy);
  } catch {
    return null;
  }
}

function keepUnreadable(json: string) {
  try {
    localStorage.setItem(UNREADABLE_KEY, json);
  } catch {
    /* storage full or blocked */
  }
}

/** The saved progress this version couldn't read, exactly as it was stored. Null if there's none. */
export function readUnreadable(): string | null {
  try {
    return localStorage.getItem(UNREADABLE_KEY);
  } catch {
    return null; // storage blocked
  }
}

export function clearUnreadable() {
  try {
    localStorage.removeItem(UNREADABLE_KEY);
  } catch {
    /* storage blocked */
  }
}

export function loadProgress(legacy: LegacyKeys): Progress {
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY), legacy);
  } catch {
    return emptyProgress(); // storage blocked
  }
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* storage full or blocked (private mode); progress lives for this visit only */
  }
}

/** The stored JSON exactly as saved, for the crash screen's export. Null if there's none. */
export function readSavedProgress(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked
  }
}

export function clearSavedProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
}

/** The file name for an exported backup, like cache-warmup-progress-2026-10-16.json. */
export function exportFileName(kind: "progress" | "progress-unreadable" = "progress") {
  return `cache-warmup-${kind}-${today()}.json`;
}
