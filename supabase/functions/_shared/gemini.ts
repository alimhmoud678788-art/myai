// 🔒 The API key lives only here (Supabase secrets), never in the desktop app.
const KEY = Deno.env.get("GEMINI_API_KEY");
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Model names change often — override with `supabase secrets set GEMINI_CHAT_MODEL=...`
export const CHAT_MODEL = Deno.env.get("GEMINI_CHAT_MODEL") ?? "gemini-2.5-flash";
export const EMBED_MODEL = Deno.env.get("GEMINI_EMBED_MODEL") ?? "gemini-embedding-001";
export const IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image";
export const EMBED_DIM = 768; // must match vector(768) in the migration

export async function gemini(path: string, body: unknown): Promise<Response> {
  if (!KEY) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  return res;
}

export async function embed(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await gemini(`models/${EMBED_MODEL}:batchEmbedContents`, {
      requests: texts.slice(i, i + 100).map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIM,
      })),
    });
    const data = await res.json();
    out.push(...data.embeddings.map((e: { values: number[] }) => e.values));
  }
  return out;
}
