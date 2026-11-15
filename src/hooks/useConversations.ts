import { supabase } from "../lib/supabase";
import { signedImageUrl, type Source } from "../lib/api";
import type { Msg } from "./useChat";

export type Conversation = { id: string; title: string; updated_at: string };
export type SearchHit = { conversation_id: string; title: string; snippet: string; created_at: string };
export type Doc = { id: string; name: string };

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function loadMessages(id: string): Promise<Msg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, metadata")
    .eq("conversation_id", id)
    .order("created_at");
  if (error) throw error;
  return Promise.all(
    (data ?? []).map(async (m) => {
      const meta = (m.metadata ?? {}) as { sources?: Source[]; image_path?: string };
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        sources: meta.sources?.length ? meta.sources : undefined,
        imageUrl: meta.image_path ? await signedImageUrl(meta.image_path) : undefined,
      } as Msg;
    }),
  );
}

export async function loadDocuments(conversationId: string): Promise<Doc[]> {
  const { data } = await supabase
    .from("documents")
    .select("id, name")
    .eq("conversation_id", conversationId)
    .order("created_at");
  return data ?? [];
}

export async function searchHistory(q: string): Promise<SearchHit[]> {
  const { data, error } = await supabase.rpc("search_messages", { q });
  if (error) throw error;
  return data ?? [];
}

export async function deleteConversation(id: string) {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function renameConversation(id: string, title: string) {
  const { error } = await supabase.from("conversations").update({ title }).eq("id", id);
  if (error) throw error;
}
