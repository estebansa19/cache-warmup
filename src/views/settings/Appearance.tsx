import { useState } from "react";
import { THEMES, readTheme, saveTheme, type Theme } from "../../styles/theme";

const LABELS: Record<Theme, { title: string; detail: string }> = {
  system: { title: "System", detail: "Follows your device." },
  light: { title: "Light", detail: "Graph paper." },
  dark: { title: "Dark", detail: "Graph paper at night." },
};

export function Appearance() {
  const [theme, setTheme] = useState(readTheme);

  function choose(next: Theme) {
    saveTheme(next);
    setTheme(next);
  }

  return (
    <section className="panel settings-card">
      <p className="eyebrow">Appearance</p>
      <fieldset className="tool-picker theme-picker">
        <legend>Theme</legend>
        {THEMES.map((option) => (
          <label key={option} className={option === theme ? "tool-option checked" : "tool-option"}>
            <input
              type="radio"
              name="theme"
              value={option}
              checked={option === theme}
              onChange={() => choose(option)}
            />
            <span>
              <b>{LABELS[option].title}</b>
              <span className="tool-detail">{LABELS[option].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
