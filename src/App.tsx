import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSession } from "./hooks/useSession";
import { listenAuthCallback } from "./lib/auth";
import { applyShortcut, DEFAULT_SHORTCUT, getShortcut } from "./lib/prefs";
import { Login } from "./components/auth/Login";
import { MainView } from "./views/MainView";
import { QuickChat } from "./views/QuickChat";

const label = getCurrentWindow().label;

export default function App() {
  const { t } = useTranslation();
  const session = useSession();

  useEffect(() => {
    if (label !== "main") return;
    const un = listenAuthCallback();
    // Re-apply a custom hotkey saved in settings (Rust registers the default at startup).
    const saved = getShortcut();
    if (saved !== DEFAULT_SHORTCUT) applyShortcut(saved).catch(console.warn);
    return () => {
      un.then((f) => f());
    };
  }, []);

  if (session === undefined) return null;
  if (!session) {
    return label === "quick" ? (
      <div className="flex h-screen items-center justify-center p-6 text-center text-sm text-zinc-500">
        {t("signInFromMain")}
      </div>
    ) : (
      <Login />
    );
  }
  return label === "quick" ? <QuickChat /> : <MainView session={session} />;
}
