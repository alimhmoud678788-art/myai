import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Update } from "@tauri-apps/plugin-updater";
import { downloadUpdate, installAndRestart } from "../../lib/updater";

const SIX_HOURS = 6 * 60 * 60 * 1000;

export function UpdateBanner() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return; // no updates in `tauri dev`
    const run = () => downloadUpdate().then((u) => u && setUpdate(u));
    run();
    const id = setInterval(run, SIX_HOURS);
    return () => clearInterval(id);
  }, []);

  if (!update) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-blue-600 px-4 py-1.5 text-sm text-white">
      <span>🚀 {t("updateReady", { version: update.version })}</span>
      <button
        disabled={installing}
        onClick={() => {
          setInstalling(true);
          installAndRestart(update).catch(() => setInstalling(false));
        }}
        className="rounded bg-white/20 px-3 py-0.5 hover:bg-white/30 disabled:opacity-50"
      >
        {t("install")}
      </button>
    </div>
  );
}
