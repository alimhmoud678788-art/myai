import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { useChat } from "../hooks/useChat";
import { MessageList } from "../components/chat/MessageList";
import { Composer } from "../components/chat/Composer";

/** Spotlight-style window toggled by the global hotkey. */
export function QuickChat() {
  const { t } = useTranslation();
  const notify = useCallback(() => {
    emit("conversations-changed");
  }, []);
  const chat = useChat(notify);

  useEffect(() => {
    const win = getCurrentWindow();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") win.hide();
    };
    window.addEventListener("keydown", onKey);
    const un = win.onFocusChanged(({ payload: focused }) => {
      if (focused) document.querySelector("textarea")?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      un.then((f) => f());
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden border border-zinc-300 dark:border-zinc-700">
      <div
        data-tauri-drag-region
        className="flex cursor-move items-center justify-between px-4 py-2 text-xs text-zinc-500 select-none"
      >
        <span data-tauri-drag-region className="font-semibold">{t("appName")}</span>
        <span data-tauri-drag-region>{t("quickHint")}</span>
      </div>
      <MessageList messages={chat.messages} busy={chat.busy} compact />
      <Composer busy={chat.busy} onSend={chat.send} onStop={chat.stop} conversationId={chat.conversationId} autoFocus compact />
    </div>
  );
}
