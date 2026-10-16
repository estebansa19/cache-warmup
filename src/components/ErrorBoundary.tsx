import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { STORAGE_KEY } from "../state/progress";
import { today } from "../utils/dates";
import { downloadFile } from "../utils/download";
import { focusFirst } from "../utils/focus";

/**
 * Shows <CrashScreen> instead of a blank page when anything below it throws.
 * A class only because React has no hook for catching render errors.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    return error ? <CrashScreen error={error} /> : this.props.children;
  }
}

/**
 * A way out after a crash: save the progress as it's stored (to look at or import later),
 * or start fresh. It works straight from localStorage, because the progress itself may be
 * what crashed.
 */
function CrashScreen({ error }: { error: Error }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState("");
  const page = useRef<HTMLElement>(null);
  const previous = useRef<boolean | null>(null);

  // Announce the crash by taking focus to its heading; after that, keep focus on the safe
  // choice when the reset buttons swap ("Keep it", or "Reset progress…" again).
  useEffect(() => {
    if (previous.current === null) {
      document.title = "Something broke · Cache Warmup";
      focusFirst(page.current, "h1");
    } else if (previous.current !== confirmReset) {
      focusFirst(page.current, confirmReset ? ".keep-progress" : ".reset-progress");
    }
    previous.current = confirmReset;
  }, [confirmReset]);

  function exportProgress() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    if (!saved) return setMessage("There's no saved progress in this browser.");
    const name = `cache-warmup-progress-${today()}.json`;
    downloadFile(name, saved);
    setMessage(`Exported. Look for ${name} in your downloads.`);
  }

  function reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    window.location.hash = "#/";
    window.location.reload();
  }

  return (
    <main className="page" ref={page}>
      <div className="panel crash">
        <h1>Something broke</h1>
        <p>
          The app hit an error it couldn't recover from. Reloading often helps. If it keeps happening, your
          saved progress may be damaged: export it as a backup, then reset.
        </p>
        <pre className="crash-detail">{error.message}</pre>
        <div className="row">
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn ghost" onClick={exportProgress}>
            Export progress
          </button>
          {confirmReset ? (
            <>
              <button className="btn danger" onClick={reset}>
                Yes, erase my progress
              </button>
              <button className="btn ghost keep-progress" onClick={() => setConfirmReset(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button className="btn ghost reset-progress" onClick={() => setConfirmReset(true)}>
              Reset progress…
            </button>
          )}
        </div>
        <p role="status" className="live">
          {message}
        </p>
      </div>
    </main>
  );
}
