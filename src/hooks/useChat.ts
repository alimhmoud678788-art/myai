import { useCallback, useRef, useState } from "react";
import { streamChat, generateImage, type Source } from "../lib/api";

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  imageUrl?: string;
  imagePending?: boolean;
  error?: boolean;
};

export const IMAGE_CMD = /^\/(image|img|صورة)\s+/i;

export function useChat(onPersisted?: () => void) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const convRef = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  const patch = (id: string, f: (m: Msg) => Msg) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? f(m) : m)));

  const setConv = (id?: string) => {
    convRef.current = id;
    setConversationId(id);
  };

  /** Switch to an existing conversation (or a blank one). */
  const load = useCallback((id: string | undefined, msgs: Msg[] = []) => {
    abort.current?.abort();
    setConv(id);
    setMessages(msgs);
  }, []);

  async function send(text: string, opts: { webSearch?: boolean; documentIds?: string[] } = {}) {
    const aid = crypto.randomUUID();
    const isImage = IMAGE_CMD.test(text);
    setMessages((ms) => [
      ...ms,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: aid, role: "assistant", content: "", imagePending: isImage },
    ]);
    setBusy(true);
    try {
      if (isImage) {
        const r = await generateImage(text.replace(IMAGE_CMD, ""), convRef.current);
        setConv(r.conversationId);
        patch(aid, (m) => ({ ...m, imageUrl: r.url, imagePending: false }));
        return;
      }
      abort.current = new AbortController();
      for await (const ev of streamChat(
        { conversationId: convRef.current, message: text, ...opts },
        abort.current.signal,
      )) {
        if (ev.type === "meta") setConv(ev.conversationId);
        else if (ev.type === "delta") patch(aid, (m) => ({ ...m, content: m.content + ev.text }));
        else if (ev.type === "sources") patch(aid, (m) => ({ ...m, sources: ev.sources }));
        else if (ev.type === "error") throw new Error(ev.message);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        patch(aid, (m) => ({
          ...m,
          imagePending: false,
          error: true,
          content: m.content + `${m.content ? "\n\n" : ""}⚠️ ${(e as Error).message}`,
        }));
      }
    } finally {
      setBusy(false);
      onPersisted?.();
    }
  }

  return { messages, busy, send, stop: () => abort.current?.abort(), conversationId, load };
}
