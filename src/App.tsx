import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApiKey } from "./hooks/useApiKey";
import { applyShortcut, DEFAULT_SHORTCUT, getShortcut } from "./lib/prefs";
import { KeySetup } from "./components/setup/KeySetup";
import { MainView } from "./views/MainView";
import { QuickChat } from "./views/QuickChat";

const label = getCurrentWindow().label;

export default function App() {
  const { t } = useTranslation();
  const { ready, markReady } = useApiKey();

  useEffect(() => {
    if (label !== "main") return;
    // Re-apply a custom hotkey saved in settings (Rust registers the default at startup).
    const saved = getShortcut();
    if (saved !== DEFAULT_SHORTCUT) applyShortcut(saved).catch(console.warn);
  }, []);

  if (ready === undefined) return null;
  if (!ready) {
    return label === "quick" ? (
      <div className="flex h-screen items-center justify-center p-6 text-center text-sm text-zinc-500">{t("setupFromMain")}</div>
    ) : (
      <KeySetup onDone={markReady} />
    );
  }
  return label === "quick" ? <QuickChat /> : <MainView />;
}
