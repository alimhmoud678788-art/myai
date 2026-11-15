import { useCallback, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { emit } from "@tauri-apps/api/event";
import { addMessage, createConversation, getMessages, type Message } from "../lib/db";
import { friendlyError, streamChat, SYSTEM_PROMPT, type ChatMessage } from "../lib/engine";
import { attachDocuments, retrieveContext } from "../lib/rag";

/** Rough budget so prompt + answer fit in the engine's 8k-token context. */
const HISTORY_CHAR_BUDGET = 9000;

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
    ? [
        ...stored,
        {
          id: draft.id,
          conversationId: conversationId ?? "",
          role: "assistant",
          content: draft.content,
          pending: draft.pending,
          createdAt: Date.now(),
        },
      ]
    : stored;

  const load = useCallback((id: string | undefined) => {
    abort.current?.abort();
    setDraft(null);
    setConversationId(id);
  }, []);

  async function send(text: string, opts: { documentIds?: string[] } = {}) {
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
      const context = await retrieveContext(text, docs);

      // Most recent turns that fit the budget, oldest first.
      const turns: ChatMessage[] = [];
      let used = 0;
      for (const m of [...history].reverse()) {
        if (!m.content || m.error) continue;
        used += m.content.length;
        if (used > HISTORY_CHAR_BUDGET) break;
        turns.unshift({ role: m.role, content: m.content });
      }
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...turns,
        { role: "user", content: context ? `Document context:\n${context}\n\nQuestion: ${text}` : text },
      ];

      for await (const piece of streamChat(messages, abort.current.signal)) {
        content += piece;
        setDraft({ id: draftId, content, pending: false });
      }
      await addMessage({ id: draftId, conversationId: convId, role: "assistant", content: content.trim() });
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
