import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";

export type Theme = "light" | "dark" | "system";
export const DEFAULT_SHORTCUT = "Ctrl+Shift+Space";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export const getTheme = () => (read("theme") as Theme | null) ?? "system";
export const getShortcut = () => read("shortcut") ?? DEFAULT_SHORTCUT;

export function applyTheme(mode: Theme) {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export async function applyShortcut(accelerator: string) {
  await invoke("set_quick_shortcut", { accelerator });
  write("shortcut", accelerator);
}

type Prefs = { theme?: Theme; lang?: string };

/** Applies locally and broadcasts to the other window (each window has its own JS context). */
export async function setPrefs(p: Prefs) {
  if (p.theme) {
    write("theme", p.theme);
    applyTheme(p.theme);
  }
  if (p.lang) await i18n.changeLanguage(p.lang);
  await emit("prefs-changed", p);
}

export function initPrefs() {
  applyTheme(getTheme());
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(getTheme()));
  listen<Prefs>("prefs-changed", ({ payload }) => {
    if (payload.theme) applyTheme(payload.theme);
    if (payload.lang && payload.lang !== i18n.language) i18n.changeLanguage(payload.lang);
  });
}
