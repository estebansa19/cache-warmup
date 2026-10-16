import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Feedback } from "../state/progress";
import {
  getStatus,
  requestFeedback,
  savePreference,
  type AIStatus,
  type FeedbackRequest,
  type Preference,
} from "./client";

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
const PREFS_KEY = "cache-warmup:prefs";

function readServerUrl(): string {
  try {
    return String(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}").bridgeUrl ?? "");
  } catch {
    return "";
  }
}

const toBase = (url: string) => url.trim().replace(/\/+$/, "");

export function AIProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setUrl] = useState(readServerUrl);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const base = toBase(serverUrl);
  // Only the newest status request may update the screen; slower, older replies are dropped.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;
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
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ bridgeUrl: url }));
      } catch {
        /* ignore */
      }
      // A new address refreshes through the effect above; the same one needs asking directly.
      if (toBase(url) === base) refresh();
      setUrl(url);
    },
    refresh,
    async choose(preference) {
      const next = await savePreference(base, preference);
      latest.current++; // this is newer than any status request still in flight
      setStatus(next);
      setPhase("ready");
    },
    ask: (request, signal) => requestFeedback(base, request, signal),
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI(): Value {
  const value = useContext(AIContext);
  if (!value) throw new Error("useAI must be used inside <AIProvider>");
  return value;
}
