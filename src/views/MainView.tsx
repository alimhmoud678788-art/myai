import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useChat } from "../hooks/useChat";
import { db } from "../lib/db";
import { Sidebar } from "../components/layout/Sidebar";
import { SettingsDialog } from "../components/layout/SettingsDialog";
import { UpdateBanner } from "../components/layout/UpdateBanner";
import { MessageList } from "../components/chat/MessageList";
import { Composer, type Doc } from "../components/chat/Composer";

export function MainView() {
  const { t } = useTranslation();
  const chat = useChat();
  const [docs, setDocs] = useState<Doc[]>([]);
  // Remount the composer only when the user switches chats (not when a new chat gets its id).
  const [composerKey, setComposerKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const select = async (id: string) => {
    const d = await db.documents.where("conversationId").equals(id).toArray();
    setDocs(d.map(({ id, name }) => ({ id, name })));
    chat.load(id);
    setComposerKey((k) => k + 1);
  };

  const newChat = () => {
    setDocs([]);
    chat.load(undefined);
    setComposerKey((k) => k + 1);
  };

  return (
    <div className="flex h-screen flex-col">
      <UpdateBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          activeId={chat.conversationId}
          onSelect={select}
          onNew={newChat}
          onDeleted={(id) => id === chat.conversationId && newChat()}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <span className="font-semibold">{t("appName")}</span>
            <button onClick={() => setShowSettings(true)} className="rounded-lg px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
              ⚙️ {t("settings")}
            </button>
          </header>
          <MessageList messages={chat.messages} busy={chat.busy} />
          <Composer
            key={composerKey}
            busy={chat.busy}
            onSend={chat.send}
            onStop={chat.stop}
            conversationId={chat.conversationId}
            initialDocs={docs}
            autoFocus
          />
        </main>
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
