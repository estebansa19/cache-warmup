import { useRef, useState } from "react";
import { ConfirmButton } from "../../components/ConfirmButton";
import { legacy } from "../../content/lessons";
import { normalize } from "../../state/normalize";
import { emptyProgress } from "../../state/progress";
import { useProgress } from "../../state/ProgressContext";
import { exportFileName } from "../../state/storage";
import { downloadFile } from "../../utils/download";
import { plural } from "../../utils/text";
import { Notices, type Message } from "./Notices";

export function ProgressSettings() {
  const { progress, dispatch } = useProgress();
  const [message, setMessage] = useState<Message>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function exportProgress() {
    const name = exportFileName();
    downloadFile(name, JSON.stringify(progress, null, 2));
    setMessage({ text: `Exported. Look for ${name} in your downloads.` });
  }

  async function importProgress(file: File) {
    try {
      // Anything broken inside the file is dropped; only a file that isn't progress at all is refused.
      const imported = normalize(JSON.parse(await file.text()), legacy);
      if (!imported) throw new Error("not progress");

      dispatch({ type: "replace", progress: imported });

      const done = Object.keys(imported.done).length;
      setMessage({ text: `Imported. Welcome back: ${imported.xp} XP and ${plural(done, "lesson")} done.` });
    } catch {
      setMessage({ error: true, text: "That file doesn't look like a Cache Warmup progress export." });
    }
  }

  function resetProgress() {
    dispatch({ type: "replace", progress: emptyProgress() });
    setMessage({ text: "Progress reset. Fresh start." });
  }

  return (
    <section className="panel settings-card">
      <p className="eyebrow">Your progress</p>
      <p>Move your progress to another browser or computer, or keep a backup.</p>
      <Notices message={message} />
      <div className="row">
        <button className="btn ghost small" onClick={exportProgress}>
          Export progress
        </button>
        <button className="btn ghost small" onClick={() => fileInput.current?.click()}>
          Import progress
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importProgress(file);
            e.target.value = "";
          }}
        />
        <ConfirmButton
          small
          label="Reset…"
          confirmLabel="Yes, reset everything"
          warning="This erases all XP, answers, and cards."
          onConfirm={resetProgress}
        />
      </div>
    </section>
  );
}
