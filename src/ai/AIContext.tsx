import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Feedback } from "../state/progress";
import {
  AIError,
  getStatus,
  requestFeedback,
  savePreference,
  serverBase,
  type AIStatus,
  type FeedbackRequest,
  type Preference,
} from "./client";

const PREFS_KEY = "cache-warmup:prefs";

type Phase = "checking" | "ready" | "unreachable";

type Value = {
  phase: Phase;
  status: AIStatus | null;
  /** Where the AI server lives. Empty means "same address as the app". */
  serverUrl: string;
  /** Saves the address and checks it, even if it didn't change. */
  setServerUrl(url: string): void;
  refresh(): Promise<void>;
  choose(preference: Preference): Promise<void>;
  ask(request: FeedbackRequest, signal: AbortSignal): Promise<Feedback>;
};

const AIContext = createContext<Value | null>(null);

export function AIProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setUrl] = useState(readServerUrl);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const base = serverBase(serverUrl, window.location.hostname);
  // Only the newest status request may update the screen; slower, older replies are dropped.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;

    if (base === null) {
      setStatus(null);
      setPhase("unreachable");
      return;
    }

    setPhase("checking");

    try {
      const next = await getStatus(base);
      if (request !== latest.current) return;

      setStatus(next);
      setPhase("ready");
    } catch {
      if (request !== latest.current) return;

      setStatus(null);
      setPhase("unreachable");
    }
  }, [base]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value: Value = {
    phase,
    status,
    serverUrl,
    setServerUrl(url) {
      saveServerUrl(url);
      // A new address refreshes through the effect above; the same one needs asking directly.
      if (serverBase(url, window.location.hostname) === base) refresh();
      setUrl(url);
    },
    refresh,
    async choose(preference) {
      const next = await savePreference(reachable(base), preference);
      latest.current++; // this is newer than any status request still in flight
      setStatus(next);
      setPhase("ready");
    },
    ask: async (request, signal) => requestFeedback(reachable(base), request, signal),
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI(): Value {
  const value = useContext(AIContext);
  if (!value) throw new Error("useAI must be used inside <AIProvider>");
  return value;
}

function readServerUrl(): string {
  try {
    return String(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}").bridgeUrl ?? "");
  } catch {
    return "";
  }
}

function saveServerUrl(url: string) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ bridgeUrl: url }));
  } catch {
    /* storage blocked: the address lasts for this visit only */
  }
}

/** The server's address, or the error the app shows when there's no server to reach. */
function reachable(base: string | null): string {
  if (base === null) throw new AIError("unreachable");
  return base;
}
