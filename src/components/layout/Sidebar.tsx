import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/plugin-dialog";
import { db, deleteConversation, renameConversation, searchHistory, type SearchHit } from "../../lib/db";

type Props = {
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
};

export function Sidebar({ activeId, onSelect, onNew, onDeleted }: Props) {
  const { t } = useTranslation();
  // Live: updates automatically when either window adds, renames or deletes a chat.
  const items = useLiveQuery(() => db.conversations.orderBy("updatedAt").reverse().limit(300).toArray(), [], []);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Debounced full-text search over message content
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    const id = setTimeout(() => {
      searchHistory(q)
        .then(setHits)
        .catch(console.error);
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const remove = async (id: string) => {
    if (!(await ask(t("confirmDelete"), { kind: "warning" }))) return;
    await deleteConversation(id);
    onDeleted(id);
  };

  const commitRename = async (id: string) => {
    const title = draft.trim();
    setEditing(null);
    if (!title) return;
    await renameConversation(id, title);
  };

  const row = "group flex items-center gap-1 rounded-lg px-2 py-2 text-sm cursor-pointer";

  return (
    <aside className="flex w-72 shrink-0 flex-col border-e border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="space-y-2 p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-start text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ＋ {t("newChat")}
        </button>
        <input
          dir="auto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {hits ? (
          hits.length ? (
            hits.map((h) => (
              <div key={h.conversationId} onClick={() => onSelect(h.conversationId)} className={`${row} flex-col items-start hover:bg-zinc-200 dark:hover:bg-zinc-800`}>
                <span dir="auto" className="w-full truncate font-medium">{h.title}</span>
                {h.snippet && <span dir="auto" className="line-clamp-2 w-full text-xs text-zinc-500">{h.snippet}</span>}
              </div>
            ))
          ) : (
            <p className="p-2 text-sm text-zinc-500">{t("noResults")}</p>
          )
        ) : items.length ? (
          items.map((c) => (
            <div
              key={c.id}
              onClick={() => editing !== c.id && onSelect(c.id)}
              className={`${row} ${c.id === activeId ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"}`}
            >
              {editing === c.id ? (
                <input
                  dir="auto"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(c.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-blue-500 bg-transparent px-1"
                />
              ) : (
                <span dir="auto" className="min-w-0 flex-1 truncate">{c.title}</span>
              )}
              <button
                title={t("rename")}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(c.id);
                  setDraft(c.title);
                }}
                className="hidden px-1 text-zinc-400 hover:text-zinc-700 group-hover:block dark:hover:text-zinc-200"
              >
                ✎
              </button>
              <button
                title={t("delete")}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c.id);
                }}
                className="hidden px-1 text-zinc-400 hover:text-red-500 group-hover:block"
              >
                🗑
              </button>
            </div>
          ))
        ) : (
          <p className="p-2 text-sm text-zinc-500">{t("noChats")}</p>
        )}
      </nav>
    </aside>
  );
}
