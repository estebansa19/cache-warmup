import { useEffect, useRef, useState } from "react";
import { useAI } from "../../ai/AIContext";
import { AIError, type AIStatus, type ProviderInfo } from "../../ai/client";
import { focusFirst } from "../../utils/focus";
import { Notices, type Message } from "./Notices";

export function AISettings() {
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
      <AIStateLine />
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

/** "Looking for the AI server…", "On · Claude Code (sonnet)", or "Off". */
function AIStateLine() {
  const ai = useAI();
  const active = ai.status?.active;

  if (ai.phase === "checking") {
    return (
      <div className="ai-state" role="status">
        <span className="dot" /> Looking for the AI server…
      </div>
    );
  }

  if (active) {
    return (
      <div className="ai-state" role="status">
        <span className="dot on" /> On · {active.label}
        {active.model && <span className="mono-note">({active.model})</span>}
      </div>
    );
  }

  return (
    <div className="ai-state" role="status">
      <span className="dot warn" /> Off
    </div>
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

type ToolPickerProps = { status: AIStatus; onMessage: (message: Message) => void };

function ToolPicker({ status, onMessage }: ToolPickerProps) {
  const ai = useAI();
  const [provider, setProvider] = useState(status.preference.provider);
  const [model, setModel] = useState(status.preference.model);
  const [saving, setSaving] = useState(false);

  const firstAvailable = status.providers.find((p) => p.available);
  const chosen = status.providers.find((p) => p.id === provider);
  const changed = provider !== status.preference.provider || model !== status.preference.model;
  const missingModel = Boolean(chosen?.needsModel && !model.trim());

  // Model names belong to one tool: switching tools clears it (or brings back the saved one).
  function pick(id: string) {
    setProvider(id);
    setModel(id === status.preference.provider ? status.preference.model : "");
  }

  async function save() {
    setSaving(true);
    onMessage(null);

    try {
      await ai.choose({ provider, model: model.trim() });
      onMessage({ text: "Saved. New feedback requests use this choice." });
    } catch (e) {
      onMessage({ error: true, text: saveErrorText(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p>{pickerSummary(status)}</p>

      {status.locked ? (
        <p className="notice">
          The server was started with <code>--provider</code> (or <code>CW_PROVIDER</code>), so the choice is
          fixed until you restart it without that flag.
        </p>
      ) : (
        <>
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

          {chosen && <ModelField provider={chosen} value={model} onChange={setModel} />}

          <div className="row">
            <button className="btn small" onClick={save} disabled={!changed || saving || missingModel}>
              {saving ? "Saving…" : "Save choice"}
            </button>
            <span className="muted">Saved on the server in cache-warmup.config.json.</span>
          </div>
        </>
      )}
    </>
  );
}

type ModelFieldProps = { provider: ProviderInfo; value: string; onChange: (model: string) => void };

/** The model name for the chosen tool, with suggestions. */
function ModelField({ provider, value, onChange }: ModelFieldProps) {
  return (
    <div className="field">
      <label htmlFor="ai-model">Model {provider.needsModel ? "(required)" : "(optional)"}</label>
      <input
        id="ai-model"
        type="text"
        list="ai-model-suggestions"
        value={value}
        placeholder={provider.needsModel ? "e.g. gpt-5-mini" : `Leave empty for ${provider.label}'s default`}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="ai-model-suggestions">
        {provider.models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
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

/** The sentence above the picker: what's on now, or why nothing is. */
function pickerSummary(status: AIStatus): string {
  if (status.active) {
    return `Feedback uses ${status.active.usage}. Only the question, its rubric, your answer, and the "About you" note are sent, and only when you ask for feedback.`;
  }

  if (status.preference.provider === "off") {
    return "You turned AI feedback off. Pick a tool below to turn it back on.";
  }

  return "None of the AI tools below is ready on this machine. Set one up, then click Check again.";
}

/** The server's own message when it sent one, or a generic hint. */
function saveErrorText(error: unknown): string {
  return error instanceof AIError && error.message !== error.code
    ? error.message
    : "Couldn't save. Is the server still running?";
}

/** Renders `backticked` parts of a hint as code. */
function withCode(text: string) {
  return text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}
