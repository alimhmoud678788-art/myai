import Dexie, { type EntityTable } from "dexie";

/**
 * Everything is stored locally on the user's PC (WebView2 IndexedDB under %LOCALAPPDATA%\com.myai.desktop).
 * Both windows share the same origin, so they share this database; Dexie live queries update both.
 */
export type Source = { uri: string; title: string };

export type Conversation = { id: string; title: string; createdAt: number; updatedAt: number };
export type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  image?: Blob;
  error?: boolean;
  createdAt: number;
};
export type DocumentRec = { id: string; conversationId: string | null; name: string; embedModel: string; createdAt: number };
export type Chunk = { id?: number; documentId: string; page: number; content: string; embedding: Float32Array };

export const db = new Dexie("myai") as Dexie & {
  conversations: EntityTable<Conversation, "id">;
  messages: EntityTable<Message, "id">;
  documents: EntityTable<DocumentRec, "id">;
  chunks: EntityTable<Chunk, "id">;
};

db.version(1).stores({
  conversations: "id, updatedAt",
  messages: "id, [conversationId+createdAt], conversationId",
  documents: "id, conversationId",
  chunks: "++id, documentId",
});

const uid = () => crypto.randomUUID();

export async function createConversation(firstMessage: string) {
  const now = Date.now();
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
  const c: Conversation = { id: uid(), title, createdAt: now, updatedAt: now };
  await db.conversations.add(c);
  return c.id;
}

export async function addMessage(m: Omit<Message, "id" | "createdAt"> & { id?: string }) {
  const msg: Message = { ...m, id: m.id ?? uid(), createdAt: Date.now() };
  await db.messages.put(msg);
  await db.conversations.update(m.conversationId, { updatedAt: msg.createdAt });
  return msg;
}

export const getMessages = (conversationId: string) =>
  db.messages
    .where("[conversationId+createdAt]")
    .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
    .toArray();

export const renameConversation = (id: string, title: string) => db.conversations.update(id, { title });

export async function deleteConversation(id: string) {
  await db.transaction("rw", [db.conversations, db.messages, db.documents, db.chunks], async () => {
    const docIds = (await db.documents.where("conversationId").equals(id).primaryKeys()) as string[];
    await db.chunks.where("documentId").anyOf(docIds).delete();
    await db.documents.bulkDelete(docIds);
    await db.messages.where("conversationId").equals(id).delete();
    await db.conversations.delete(id);
  });
}

export async function deleteAllData() {
  await Promise.all([db.conversations.clear(), db.messages.clear(), db.documents.clear(), db.chunks.clear()]);
}

export type SearchHit = { conversationId: string; title: string; snippet: string };

/** Case-insensitive substring search over titles and message text (works for Arabic and English). */
export async function searchHistory(q: string, limit = 50): Promise<SearchHit[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const convs = new Map((await db.conversations.toArray()).map((c) => [c.id, c]));
  const hits = new Map<string, SearchHit>();
  for (const c of convs.values()) {
    if (c.title.toLowerCase().includes(needle)) hits.set(c.id, { conversationId: c.id, title: c.title, snippet: "" });
  }
  await db.messages.each((m) => {
    if (hits.size >= limit || hits.has(m.conversationId)) return;
    const i = m.content.toLowerCase().indexOf(needle);
    const c = convs.get(m.conversationId);
    if (i >= 0 && c) {
      const start = Math.max(0, i - 40);
      hits.set(c.id, { conversationId: c.id, title: c.title, snippet: m.content.slice(start, start + 160) });
    }
  });
  return [...hits.values()];
}
