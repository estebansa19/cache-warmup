import { Component, type ReactNode } from "react";
import { STORAGE_KEY } from "../state/progress";
import { today } from "../utils/dates";
import { downloadFile } from "../utils/download";

type State = { error: Error | null; confirmReset: boolean; message: string };

/**
 * If anything crashes, show a way out instead of a blank page: save the progress as it is
 * stored (to look at or import later), or start fresh. It works straight from localStorage,
 * because the progress itself may be what crashed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, confirmReset: false, message: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  exportProgress = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    if (!saved) return this.setState({ message: "There's no saved progress in this browser." });
    const name = `cache-warmup-progress-${today()}.json`;
    downloadFile(name, saved);
    this.setState({ message: `Exported. Look for ${name} in your downloads.` });
  };

  reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    window.location.hash = "#/";
    window.location.reload();
  };

  render() {
    const { error, confirmReset, message } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="page">
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
            <button className="btn ghost" onClick={this.exportProgress}>
              Export progress
            </button>
            {confirmReset ? (
              <>
                <button className="btn danger" onClick={this.reset}>
                  Yes, erase my progress
                </button>
                <button className="btn ghost" onClick={() => this.setState({ confirmReset: false })}>
                  Keep it
                </button>
              </>
            ) : (
              <button className="btn ghost" onClick={() => this.setState({ confirmReset: true })}>
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
}
