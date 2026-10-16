import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { loadProgress, reducer, saveProgress, type Action, type Progress } from "./progress";

type Value = { progress: Progress; dispatch: Dispatch<Action> };

const ProgressContext = createContext<Value | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, dispatch] = useReducer(reducer, undefined, loadProgress);

  // Save shortly after changes settle, so typing an answer doesn't write on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => saveProgress(progress), 300);
    return () => clearTimeout(timer);
  }, [progress]);

  // Save right away if the tab is closed mid-wait.
  useEffect(() => {
    const flush = () => saveProgress(progress);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [progress]);

  return <ProgressContext.Provider value={{ progress, dispatch }}>{children}</ProgressContext.Provider>;
}

export function useProgress(): Value {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("useProgress must be used inside <ProgressProvider>");
  return value;
}
