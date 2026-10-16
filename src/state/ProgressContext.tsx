import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import { legacy } from "../content/lessons";
import {
  STORAGE_KEY,
  loadProgress,
  parseStored,
  reducer,
  saveProgress,
  type Action,
  type Progress,
} from "./progress";

type Value = { progress: Progress; dispatch: Dispatch<Action> };

const ProgressContext = createContext<Value | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, dispatch] = useReducer(reducer, legacy, loadProgress);
  // Progress that came from another tab: already saved, so don't write it back.
  const fromOtherTab = useRef<Progress | null>(null);

  // Save shortly after changes settle, so typing an answer doesn't write on every keystroke.
  useEffect(() => {
    if (progress === fromOtherTab.current) return;
    const timer = setTimeout(() => saveProgress(progress), 300);
    return () => clearTimeout(timer);
  }, [progress]);

  // Save right away if the tab is closed mid-wait.
  useEffect(() => {
    const flush = () => {
      if (progress !== fromOtherTab.current) saveProgress(progress);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [progress]);

  // Another tab saved: show its progress here too, instead of overwriting it later.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return; // null: the other tab cleared storage
      const next = parseStored(e.key === null ? null : e.newValue, legacy);
      fromOtherTab.current = next;
      dispatch({ type: "replace", progress: next });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <ProgressContext.Provider value={{ progress, dispatch }}>{children}</ProgressContext.Provider>;
}

export function useProgress(): Value {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("useProgress must be used inside <ProgressProvider>");
  return value;
}
