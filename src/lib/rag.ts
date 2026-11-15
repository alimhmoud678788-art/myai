import { db } from "./db";
import { embed } from "./gemini";

function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Returns the most relevant chunks of the given documents for a question, formatted as context. */
export async function retrieveContext(question: string, documentIds: string[], k = 8): Promise<string> {
  if (!documentIds.length) return "";
  const { vectors } = await embed([question], "RETRIEVAL_QUERY");
  const q = vectors[0];
  const chunks = await db.chunks.where("documentId").anyOf(documentIds).toArray();
  return chunks
    .filter((c) => c.embedding.length === q.length) // skip docs indexed with a different model
    .map((c) => ({ c, score: cosine(q, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ c }) => `[p. ${c.page}] ${c.content}`)
    .join("\n---\n");
}

/** Links PDFs uploaded before the chat existed to the new conversation. */
export async function attachDocuments(documentIds: string[], conversationId: string) {
  await db.documents.where("id").anyOf(documentIds).filter((d) => d.conversationId === null).modify({ conversationId });
}
