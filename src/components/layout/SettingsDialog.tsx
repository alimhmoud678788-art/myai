import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../../i18n";
import { applyShortcut, getShortcut, getTheme, setPrefs, type Theme } from "../../lib/prefs";
import { ask } from "@tauri-apps/plugin-dialog";
import { emit } from "@tauri-apps/api/event";
import { getModels, removeApiKey, type Models } from "../../lib/gemini";
import { deleteAllData } from "../../lib/db";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [shortcut, setShortcut] = useState(getShortcut());
  const [shortcutError, setShortcutError] = useState(false);
  const [models, setModels] = useState<Models | null>(null);

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);

  const changeKey = async () => {
    if (!(await ask(t("confirmRemoveKey"), { kind: "warning" }))) return;
    await removeApiKey();
    await emit("key-changed");
  };

  const wipe = async () => {
    if (!(await ask(t("confirmDeleteAll"), { kind: "warning" }))) return;
    await deleteAllData();
    onClose();
  };

  const saveShortcut = async () => {
    try {
      await applyShortcut(shortcut.trim());
      setShortcutError(false);
    } catch {
      setShortcutError(true);
    }
  };

  const field = "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold">{t("settings")}</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t("theme")}</label>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTheme(m);
                  setPrefs({ theme: m });
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  theme === m ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {t(m)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t("language")}</label>
          <select value={i18n.language} onChange={(e) => setPrefs({ lang: e.target.value })} className={field}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="text-black">
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t("shortcut")}</label>
          <div className="flex gap-2" dir="ltr">
            <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} className={`${field} font-mono`} />
            <button onClick={saveShortcut} className="rounded-lg bg-blue-600 px-4 text-sm text-white">
              {t("save")}
            </button>
          </div>
          <p className={`text-xs ${shortcutError ? "text-red-500" : "text-zinc-500"}`}>
            {shortcutError ? t("shortcutError") : t("shortcutHint")}
          </p>
        </div>

        <div className="space-y-2 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t("apiKey")}</span>
            <button onClick={changeKey} className="rounded-lg border border-zinc-300 px-3 py-1 dark:border-zinc-700">
              {t("changeKey")}
            </button>
          </div>
          {models && (
            <p dir="ltr" className="font-mono text-xs text-zinc-500">
              chat: {models.chat} · embed: {models.embed} · image: {models.image ?? "—"}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button onClick={wipe} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
            {t("deleteAll")}
          </button>
          <button onClick={onClose} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
