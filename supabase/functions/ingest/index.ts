// POST /functions/v1/ingest  →  { documentId, chunks }
// body: { name, conversationId?, chunks: [{ page, content }] }
// Text is extracted on the user's PC (pdf.js); only text chunks are sent here.
import { json, preflight, handleError } from "../_shared/cors.ts";
import { consumeQuota, getUserClient } from "../_shared/auth.ts";
import { embed } from "../_shared/gemini.ts";

type Chunk = { page: number; content: string };
const MAX_CHUNKS = 2000;
const MAX_CHUNK_CHARS = 4000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { supabase, user } = await getUserClient(req);
    const body = await req.json().catch(() => ({}));
    const raw: unknown = body.chunks;
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_CHUNKS) {
      return json({ error: "Invalid chunks" }, 400);
    }
    const chunks: Chunk[] = raw
      .filter((c) => c && typeof c.content === "string" && c.content.trim())
      .map((c) => ({ page: Number(c.page) || 0, content: String(c.content).slice(0, MAX_CHUNK_CHARS) }));
    if (!chunks.length) return json({ error: "Empty document" }, 400);

    await consumeQuota(supabase, "ingest");

    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        name: String(body.name ?? "document.pdf").slice(0, 255),
        conversation_id: typeof body.conversationId === "string" ? body.conversationId : null,
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      const vectors = await embed(chunks.map((c) => c.content), "RETRIEVAL_DOCUMENT");
      const rows = chunks.map((c, i) => ({
        document_id: doc.id,
        user_id: user.id,
        page: c.page,
        content: c.content,
        embedding: vectors[i],
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("document_chunks").insert(rows.slice(i, i + 200));
        if (error) throw error;
      }
      return json({ documentId: doc.id, chunks: rows.length });
    } catch (e) {
      await supabase.from("documents").delete().eq("id", doc.id); // no half-indexed documents
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
});
