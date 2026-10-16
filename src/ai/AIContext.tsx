import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getStatus, requestJson, savePreference, type AIStatus, type Preference } from "./client";

type Phase = "checking" | "ready" | "unreachable";

type Value = {
  phase: Phase;
  status: AIStatus | null;
  /** Where the AI server lives. Empty means "same address as the app". */
  serverUrl: string;
  setServerUrl(url: string): void;
  refresh(): Promise<void>;
  choose(preference: Preference): Promise<void>;
  ask(prompt: string, signal: AbortSignal): Promise<unknown>;
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

export function AIProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setUrl] = useState(readServerUrl);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const base = serverUrl.trim().replace(/\/+$/, "");

  const refresh = useCallback(async () => {
    setPhase("checking");
    try {
      setStatus(await getStatus(base));
      setPhase("ready");
    } catch {
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
      setUrl(url);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ bridgeUrl: url }));
      } catch {
        /* ignore */
      }
    },
    refresh,
    async choose(preference) {
      setStatus(await savePreference(base, preference));
    },
    ask: (prompt, signal) => requestJson(base, prompt, signal),
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI(): Value {
  const value = useContext(AIContext);
  if (!value) throw new Error("useAI must be used inside <AIProvider>");
  return value;
}
