// POST /functions/v1/chat  →  text/event-stream
// body: { conversationId?, message, webSearch?, documentIds? }
// events: meta → delta* → sources? → done | error
import { cors, json, preflight, handleError } from "../_shared/cors.ts";
import { consumeQuota, ensureConversation, getUserClient } from "../_shared/auth.ts";
import { CHAT_MODEL, embed, gemini } from "../_shared/gemini.ts";

const SYSTEM = `You are MyAI, a helpful, concise assistant.
- Always reply in the same language the user writes in (Arabic, English, or other).
- Format answers in Markdown. Put code in fenced blocks with a language tag.
- When "Document context" is provided, answer from it and cite pages like [p. 3]. If the answer is not in the context, say so clearly.
- When you use web search results, keep facts accurate and recent.`;

const HISTORY_LIMIT = 20;

type GeminiPart = { text?: string };
type GroundingChunk = { web?: { uri?: string; title?: string } };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { supabase, user } = await getUserClient(req);
    const body = await req.json().catch(() => ({}));
    const message: unknown = body.message;
    const webSearch = body.webSearch === true;
    const documentIds: string[] = Array.isArray(body.documentIds)
      ? body.documentIds.filter((x: unknown) => typeof x === "string").slice(0, 10)
      : [];

    if (typeof message !== "string" || !message.trim() || message.length > 20_000) {
      return json({ error: "Invalid message" }, 400);
    }
    await consumeQuota(supabase, "chat");

    const conversationId = await ensureConversation(supabase, user.id, body.conversationId, message);

    // Attach PDFs uploaded before the conversation existed (RLS limits this to the user's own docs).
    if (documentIds.length) {
      await supabase
        .from("documents")
        .update({ conversation_id: conversationId })
        .in("id", documentIds)
        .is("conversation_id", null);
    }

    const { error: insErr } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: message });
    if (insErr) throw insErr;

    const { data: history, error: histErr } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .neq("content", "")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (histErr) throw histErr;

    const contents = (history ?? []).reverse().map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content as string }],
    }));

    // RAG: inject the most relevant chunks into the latest user turn.
    if (documentIds.length) {
      const [q] = await embed([message], "RETRIEVAL_QUERY");
      const { data: chunks, error } = await supabase.rpc("match_chunks", {
        query_embedding: q,
        document_ids: documentIds,
        match_count: 8,
      });
      if (error) throw error;
      const ctx = (chunks ?? [])
        .map((c: { page: number; content: string }) => `[p. ${c.page}] ${c.content}`)
        .join("\n---\n");
      if (ctx) contents[contents.length - 1].parts[0].text = `Document context:\n${ctx}\n\nQuestion: ${message}`;
    }

    const request: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: { temperature: 0.7 },
    };
    if (webSearch) request.tools = [{ google_search: {} }];

    const upstream = await gemini(`models/${CHAT_MODEL}:streamGenerateContent?alt=sse`, request);
    const enc = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        send({ type: "meta", conversationId });

        let full = "";
        const sources = new Map<string, string>();
        try {
          const reader = upstream.body!.pipeThrough(new TextDecoderStream()).getReader();
          let buf = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value.replace(/\r/g, "");
            let i: number;
            while ((i = buf.indexOf("\n\n")) !== -1) {
              const evt = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const line = evt.split("\n").find((l) => l.startsWith("data: "));
              if (!line) continue;
              const cand = JSON.parse(line.slice(6)).candidates?.[0];
              const text = (cand?.content?.parts ?? []).map((p: GeminiPart) => p.text ?? "").join("");
              if (text) {
                full += text;
                send({ type: "delta", text });
              }
              for (const g of (cand?.groundingMetadata?.groundingChunks ?? []) as GroundingChunk[]) {
                if (g.web?.uri) sources.set(g.web.uri, g.web.title ?? g.web.uri);
              }
            }
          }

          const src = [...sources].map(([uri, title]) => ({ uri, title }));
          if (src.length) send({ type: "sources", sources: src });

          await supabase.from("messages").insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: full,
            metadata: src.length ? { sources: src } : {},
          });
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationId);
          send({ type: "done" });
        } catch (e) {
          console.error(e);
          send({ type: "error", message: "Generation failed" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return handleError(e);
  }
});
