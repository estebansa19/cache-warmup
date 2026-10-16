import { useEffect, useRef, useState } from "react";
import { useAI } from "../ai/AIContext";
import { AIError, type AIStatus } from "../ai/client";
import { legacy } from "../content/lessons";
import { useProgress } from "../state/ProgressContext";
import { emptyProgress, normalize } from "../state/progress";
import { today } from "../utils/dates";
import { downloadFile } from "../utils/download";
import { focusFirst } from "../utils/focus";
import "./Settings.css";

type Message = { text: string; error?: boolean } | null;

/** Two live regions that are always on the page, so screen readers announce what changes in them. */
function Notices({ message }: { message: Message }) {
  return (
    <>
      <p role="status" className={message && !message.error ? "notice live" : "live"}>
        {message && !message.error ? message.text : null}
      </p>
      <p role="alert" className={message?.error ? "notice error live" : "live"}>
        {message?.error ? message.text : null}
      </p>
    </>
  );
}

export function Settings() {
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Make it yours</h1>
        <p>Everything here is optional. Your progress stays in this browser unless you export it.</p>
      </div>
      <div className="settings">
        <AISettings />
        <AboutYou />
        <ProgressSettings />
      </div>
    </>
  );
}

/* ---------- AI feedback ---------- */

function AISettings() {
  const ai = useAI();
  // Kept here, not in ToolPicker, so "Saved" survives the picker starting over after a save.
  const [message, setMessage] = useState<Message>(null);
  const section = useRef<HTMLElement>(null);
  // Saving rebuilds the picker (and its Save button), so put focus on the new state line.
  useEffect(() => {
    if (message && !message.error) focusFirst(section.current, ".ai-state");
  }, [message]);
  return (
    <section className="panel settings-card" ref={section}>
      <p className="eyebrow">AI feedback</p>
      <div className="ai-state" role="status">
        {ai.phase === "checking" ? (
          <>
            <span className="dot" /> Looking for the AI server…
          </>
        ) : ai.status?.active ? (
          <>
            <span className="dot on" /> On · {ai.status.active.label}
            {ai.status.active.model && <span className="mono-note">({ai.status.active.model})</span>}
          </>
        ) : (
          <>
            <span className="dot warn" /> Off
          </>
        )}
      </div>
      {ai.phase === "unreachable" && <ServerNotRunning />}
      {/* key: start over from the server's choice whenever it changes (after saving, or "Check again") */}
      {ai.phase === "ready" && ai.status && (
        <ToolPicker key={JSON.stringify(ai.status.preference)} status={ai.status} onMessage={setMessage} />
      )}
      <Notices message={message} />
      <div className="row">
        <button className="btn ghost small" onClick={() => ai.refresh()}>
          Check again
        </button>
      </div>
      <ServerAddress />
    </section>
  );
}

function ServerNotRunning() {
  return (
    <>
      <p>The lessons work fine without it. To get a mock interviewer that grades your answers:</p>
      <ol>
        <li>
          Have one AI tool installed and logged in. Claude Code works best, and it uses your Claude plan
          instead of API credits. Codex CLI, Gemini CLI, OpenCode, Ollama, and API keys also work.
        </li>
        <li>
          In the project folder, run <code>npm start</code>.
        </li>
        <li>
          Use the page it opens (<code>http://localhost:4317</code>). It finds your tool on its own, and you
          can pick a different one here.
        </li>
      </ol>
    </>
  );
}

function ToolPicker({ status, onMessage }: { status: AIStatus; onMessage: (message: Message) => void }) {
  const ai = useAI();
  const [provider, setProvider] = useState(status.preference.provider);
  const [model, setModel] = useState(status.preference.model);
  const [saving, setSaving] = useState(false);

  // Model names belong to one tool: switching tools clears it (or brings back the saved one).
  const pick = (id: string) => {
    setProvider(id);
    setModel(id === status.preference.provider ? status.preference.model : "");
  };

  const firstAvailable = status.providers.find((p) => p.available);
  const chosen = status.providers.find((p) => p.id === provider);
  const changed = provider !== status.preference.provider || model !== status.preference.model;
  const missingModel = Boolean(chosen?.needsModel && !model.trim());

  async function save() {
    setSaving(true);
    onMessage(null);
    try {
      await ai.choose({ provider, model: model.trim() });
      onMessage({ text: "Saved. New feedback requests use this choice." });
    } catch (e) {
      onMessage({
        error: true,
        text:
          e instanceof AIError && e.message !== e.code
            ? e.message
            : "Couldn't save. Is the server still running?",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p>
        {status.active
          ? `Feedback uses ${status.active.usage}. Only the question, its rubric, your answer, and the "About you" note are sent, and only when you ask for feedback.`
          : status.preference.provider === "off"
            ? "You turned AI feedback off. Pick a tool below to turn it back on."
            : "None of the AI tools below is ready on this machine. Set one up, then click Check again."}
      </p>

      {status.locked ? (
        <p className="notice">
          The server was started with <code>--provider</code> (or <code>CW_PROVIDER</code>), so the choice is
          fixed until you restart it without that flag.
        </p>
      ) : (
        <fieldset className="tool-picker">
          <legend>Which tool should grade your answers?</legend>
          <ToolOption
            id="auto"
            checked={provider === "auto"}
            onPick={pick}
            title="Automatic"
            detail={
              firstAvailable
                ? `Uses the first one found: ${firstAvailable.label} right now.`
                : "Uses the first tool it finds."
            }
          />
          {status.providers.map((p) => (
            <ToolOption
              key={p.id}
              id={p.id}
              checked={provider === p.id}
              onPick={pick}
              title={p.label}
              detail={p.available ? `Uses ${p.usage}.` : p.hint}
              disabled={!p.available}
            />
          ))}
          <ToolOption
            id="off"
            checked={provider === "off"}
            onPick={pick}
            title="Off"
            detail="No AI feedback. Compare with the strong answers instead."
          />
        </fieldset>
      )}

      {!status.locked && chosen && (
        <div className="field">
          <label htmlFor="ai-model">Model {chosen.needsModel ? "(required)" : "(optional)"}</label>
          <input
            id="ai-model"
            type="text"
            list="ai-model-suggestions"
            value={model}
            placeholder={chosen.needsModel ? "e.g. gpt-5-mini" : `Leave empty for ${chosen.label}'s default`}
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id="ai-model-suggestions">
            {chosen.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      )}

      {!status.locked && (
        <div className="row">
          <button className="btn small" onClick={save} disabled={!changed || saving || missingModel}>
            {saving ? "Saving…" : "Save choice"}
          </button>
          <span className="muted">Saved on the server in cache-warmup.config.json.</span>
        </div>
      )}
    </>
  );
}

type ToolOptionProps = {
  id: string;
  title: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onPick: (id: string) => void;
};

function ToolOption({ id, title, detail, checked, disabled, onPick }: ToolOptionProps) {
  return (
    <label className={`tool-option${disabled ? " disabled" : ""}${checked ? " checked" : ""}`}>
      <input
        type="radio"
        name="ai-tool"
        value={id}
        checked={checked}
        disabled={disabled}
        onChange={() => onPick(id)}
      />
      <span>
        <b>{title}</b>
        <span className="tool-detail">
          {disabled && "Not set up: "}
          {withCode(detail)}
        </span>
      </span>
    </label>
  );
}

/** Renders `backticked` parts of a hint as code. */
const withCode = (text: string) =>
  text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

function ServerAddress() {
  const ai = useAI();
  const [value, setValue] = useState(ai.serverUrl);
  return (
    <details>
      <summary>Advanced: the AI server is on another address</summary>
      <div className="field">
        <label htmlFor="server-url">Server address</label>
        <input
          id="server-url"
          type="text"
          inputMode="url"
          placeholder="http://localhost:4317"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span className="help">
          Only needed when you open the app from somewhere other than the server itself, like a static host.
          Leave it empty otherwise. The server has to allow this page's address too (see "Hosting it yourself"
          in the README).
        </span>
      </div>
      <div className="row">
        <button className="btn small" onClick={() => ai.setServerUrl(value.trim())}>
          Save and check
        </button>
      </div>
    </details>
  );
}

/* ---------- about you ---------- */

function AboutYou() {
  const { progress, dispatch } = useProgress();
  return (
    <section className="panel settings-card">
      <p className="eyebrow">About you</p>
      <div className="field">
        <label htmlFor="profile">What should the interviewer know about you?</label>
        <textarea
          id="profile"
          className="ruled short"
          value={progress.profile}
          onChange={(e) => dispatch({ type: "profile", text: e.target.value })}
          placeholder="Example: Senior backend engineer, 6 years. Mostly Python and Django, some Go. Payments and logistics."
        />
        <span className="help">
          Used to calibrate the feedback, since a junior and a staff engineer get graded differently. It's
          sent with each answer you submit for feedback.
        </span>
      </div>
    </section>
  );
}

/* ---------- progress ---------- */

function ProgressSettings() {
  const { progress, dispatch } = useProgress();
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resetButtons = useRef<HTMLDivElement>(null);
  const resetToggled = useRef(false);

  // The reset buttons swap places: keep focus on the safe choice ("Keep it", or "Reset…" again).
  useEffect(() => {
    if (!resetToggled.current) return;
    focusFirst(resetButtons.current, confirmReset ? ".keep-progress" : ".reset-progress");
  }, [confirmReset]);
  const toggleReset = (open: boolean) => {
    resetToggled.current = true;
    setConfirmReset(open);
  };

  function exportProgress() {
    const name = `cache-warmup-progress-${today()}.json`;
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
      setMessage({
        text: `Imported. Welcome back: ${imported.xp} XP and ${done} lesson${done === 1 ? "" : "s"} done.`,
      });
    } catch {
      setMessage({ error: true, text: "That file doesn't look like a Cache Warmup progress export." });
    }
  }

  return (
    <section className="panel settings-card">
      <p className="eyebrow">Your progress</p>
      <p>Move your progress to another browser or computer, or keep a backup.</p>
      <Notices message={message} />
      <div className="row" ref={resetButtons}>
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
        {confirmReset ? (
          <>
            <span className="muted">This erases all XP, answers, and cards.</span>
            <button
              className="btn small danger"
              onClick={() => {
                dispatch({ type: "replace", progress: emptyProgress() });
                toggleReset(false);
                setMessage({ text: "Progress reset. Fresh start." });
              }}
            >
              Yes, reset everything
            </button>
            <button className="btn ghost small keep-progress" onClick={() => toggleReset(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button className="btn ghost small reset-progress" onClick={() => toggleReset(true)}>
            Reset…
          </button>
        )}
      </div>
    </section>
  );
}
