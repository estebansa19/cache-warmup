import { today } from "../utils/dates";
import { normalize, type LegacyKeys } from "./normalize";
import { emptyProgress, type Progress } from "./progress";

/*
 * Progress in localStorage. Every access is wrapped: storage can be blocked (private
 * mode, strict settings) or full, and the app keeps working for the visit either way.
 */

/** Unchanged since version 1, so existing progress is found and upgraded in place. */
export const STORAGE_KEY = "cache-warmup:v1";

/** Parses the stored (or another tab's) JSON. */
export function parseStored(json: string | null, legacy: LegacyKeys): Progress {
  try {
    return normalize(JSON.parse(json ?? "null"), legacy) ?? emptyProgress();
  } catch {
    return emptyProgress();
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
export function exportFileName() {
  return `cache-warmup-progress-${today()}.json`;
}
