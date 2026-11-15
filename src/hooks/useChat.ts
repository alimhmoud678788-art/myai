import { useCallback, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { emit } from "@tauri-apps/api/event";
import { addMessage, createConversation, getMessages, type Message } from "../lib/db";
import { friendlyError, generateImage, streamChat, type Turn } from "../lib/gemini";
import { attachDocuments, retrieveContext } from "../lib/rag";

export const IMAGE_CMD = /^\/(image|img|صورة)\s+/i;
const HISTORY_LIMIT = 20;

/** A message still being streamed is kept in memory and only written to the DB when complete. */
type Draft = { id: string; content: string; pending: boolean };

export function useChat() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const stored = useLiveQuery(
    () => (conversationId ? getMessages(conversationId) : Promise.resolve([] as Message[])),
    [conversationId],
    [] as Message[],
  );

  // Keep showing the draft until the live query has picked up the saved message (no flicker).
  const showDraft = draft && !stored.some((m) => m.id === draft.id);
  const messages: (Message & { pending?: boolean })[] = showDraft
    ? [...stored, { id: draft.id, conversationId: conversationId ?? "", role: "assistant", content: draft.content, pending: draft.pending, createdAt: Date.now() }]
    : stored;

  const load = useCallback((id: string | undefined) => {
    abort.current?.abort();
    setDraft(null);
    setConversationId(id);
  }, []);

  async function send(text: string, opts: { webSearch?: boolean; documentIds?: string[] } = {}) {
    const docs = opts.documentIds ?? [];
    let convId = conversationId;
    if (!convId) {
      convId = await createConversation(text);
      setConversationId(convId);
    }
    if (docs.length) await attachDocuments(docs, convId);

    const history = await getMessages(convId); // before adding this turn
    await addMessage({ conversationId: convId, role: "user", content: text });
    const draftId = crypto.randomUUID();
    setDraft({ id: draftId, content: "", pending: true });
    setBusy(true);
    abort.current = new AbortController();
    let content = "";

    try {
      if (IMAGE_CMD.test(text)) {
        const image = await generateImage(text.replace(IMAGE_CMD, ""));
        await addMessage({ id: draftId, conversationId: convId, role: "assistant", content: "", image });
        return;
      }

      const context = await retrieveContext(text, docs);
      const turns: Turn[] = history
        .filter((m) => m.content && !m.error)
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", text: m.content }));
      turns.push({ role: "user", text: context ? `Document context:\n${context}\n\nQuestion: ${text}` : text });

      let sources;
      for await (const ev of streamChat(turns, { webSearch: opts.webSearch, signal: abort.current.signal })) {
        if (ev.type === "delta") {
          content += ev.text;
          setDraft({ id: draftId, content, pending: false });
        } else sources = ev.sources;
      }
      await addMessage({ id: draftId, conversationId: convId, role: "assistant", content, sources });
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      await addMessage({
        id: draftId,
        conversationId: convId,
        role: "assistant",
        content: aborted ? content : `${content}${content ? "\n\n" : ""}⚠️ ${friendlyError(e)}`,
        error: !aborted,
      });
    } finally {
      setBusy(false);
      emit("conversations-changed").catch(() => {});
    }
  }

  return { messages, busy, send, stop: () => abort.current?.abort(), conversationId, load };
}
