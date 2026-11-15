// POST /functions/v1/image  →  { conversationId, path, url }
// body: { prompt, conversationId? }
import { json, preflight, handleError } from "../_shared/cors.ts";
import { consumeQuota, ensureConversation, getUserClient } from "../_shared/auth.ts";
import { gemini, IMAGE_MODEL } from "../_shared/gemini.ts";

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { supabase, user } = await getUserClient(req);
    const body = await req.json().catch(() => ({}));
    const prompt: unknown = body.prompt;
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) {
      return json({ error: "Invalid prompt" }, 400);
    }
    await consumeQuota(supabase, "image");

    const res = await gemini(`models/${IMAGE_MODEL}:generateContent`, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });
    const data = await res.json();
    const parts: Part[] = data.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => p.inlineData)?.inlineData;
    if (!img) {
      const reason = parts.map((p) => p.text ?? "").join(" ").trim();
      return json({ error: reason || "No image returned (the prompt may have been blocked)" }, 502);
    }

    const ext = img.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage
      .from("generated-images")
      .upload(path, base64ToBytes(img.data), { contentType: img.mimeType });
    if (up.error) throw up.error;

    const conversationId = await ensureConversation(supabase, user.id, body.conversationId, prompt);
    const { error: msgErr } = await supabase.from("messages").insert([
      { conversation_id: conversationId, user_id: user.id, role: "user", content: `/image ${prompt}` },
      {
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: "",
        metadata: { image_path: path },
      },
    ]);
    if (msgErr) throw msgErr;
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

    const { data: signed } = await supabase.storage.from("generated-images").createSignedUrl(path, 3600);
    return json({ conversationId, path, url: signed?.signedUrl });
  } catch (e) {
    return handleError(e);
  }
});
