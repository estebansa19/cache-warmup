/*
 * The color theme picked in Settings → Appearance, saved in this browser only (it isn't part
 * of your progress). "system" follows the device. tokens.css reads it from <html data-theme>.
 */

export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

const THEME_KEY = "cache-warmup:theme";

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.find((theme) => theme === saved) ?? "system";
  } catch {
    return "system"; // storage blocked
  }
}

export function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: Theme) {
  applyTheme(theme);

  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked: the theme lasts for this visit only */
  }
}
