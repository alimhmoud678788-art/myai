import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEngine } from "./hooks/useEngine";
import { applyShortcut, DEFAULT_SHORTCUT, getShortcut } from "./lib/prefs";
import { ModelSetup } from "./components/setup/ModelSetup";
import { MainView } from "./views/MainView";
import { QuickChat } from "./views/QuickChat";

const label = getCurrentWindow().label;

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>;
}

export default function App() {
  const { t } = useTranslation();
  const { phase, boot, openSetup } = useEngine();
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (label !== "main") return;
    // Re-apply a custom hotkey saved in settings (Rust registers the default at startup).
    const saved = getShortcut();
    if (saved !== DEFAULT_SHORTCUT) applyShortcut(saved).catch(console.warn);
  }, []);

  if (label === "quick" && phase.kind !== "ready") {
    return (
      <Centered>
        <p className="text-sm text-zinc-500">{phase.kind === "setup" ? t("setupFromMain") : t("starting")}</p>
      </Centered>
    );
  }

  if (phase.kind === "setup" || changing) {
    return (
      <ModelSetup
        onReady={(id) => {
          setChanging(false);
          boot(id);
        }}
        onCancel={changing ? () => setChanging(false) : undefined}
      />
    );
  }

  switch (phase.kind) {
    case "checking":
      return null;
    case "starting":
      return (
        <Centered>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-zinc-500">{t("starting")}</p>
        </Centered>
      );
    case "error":
      return (
        <Centered>
          <p className="text-lg font-semibold">{t("engineError")}</p>
          <p className="max-w-md text-sm text-zinc-500">{t("engineErrorHint")}</p>
          <div className="flex gap-2">
            <button onClick={() => boot()} className="rounded-lg bg-blue-600 px-4 py-2 text-white">{t("retry")}</button>
            <button onClick={openSetup} className="rounded-lg border border-zinc-300 px-4 py-2 dark:border-zinc-700">{t("changeModel")}</button>
          </div>
          <pre dir="ltr" className="mt-2 max-h-40 max-w-2xl overflow-auto rounded bg-zinc-100 p-2 text-start text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            {phase.log}
          </pre>
        </Centered>
      );
    default:
      return label === "quick" ? <QuickChat /> : <MainView onChangeModel={() => setChanging(true)} />;
  }
}
