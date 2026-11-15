import { db } from "./db";

/**
 * Offline document search (BM25) — no AI service needed. Arabic text is normalized
 * (diacritics, alef/ya/ta-marbuta forms, the "ال" prefix) so different spellings still match.
 */
const STOP = new Set(
  (
    "في من على الى إلى عن ما ماذا هل هو هي هم انا أنا انت أنت هذا هذه ذلك تلك التي الذي الذين كان كانت يكون مع او أو ثم لا لم لن قد كل اي أي " +
    "ايه إيه ده دي دا اللي عايز عاوز ازاي إزاي فين امتى ليه " +
    "the a an of to in on at for and or is are was were be been it this that these those what which who how why when where do does did with from by as about can"
  ).split(/\s+/),
);

export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/^(وال|بال|كال|فال|لل|ال)/, "") : t))
    .map((t) => (/^[a-z]+$/.test(t) && t.length > 4 ? t.replace(/(ies|es|s)$/, "") : t));
}

export async function retrieveContext(question: string, documentIds: string[], k = 5): Promise<string> {
  if (!documentIds.length) return "";
  const chunks = await db.chunks.where("documentId").anyOf(documentIds).toArray();
  if (!chunks.length) return "";

  const docs = chunks.map((c) => tokenize(c.content));
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / docs.length || 1;
  const terms = [...new Set(tokenize(question))];
  const df = new Map(terms.map((t) => [t, docs.filter((d) => d.includes(t)).length]));
  const N = docs.length;
  const k1 = 1.5;
  const b = 0.75;

  const scored = chunks.map((c, i) => {
    const d = docs[i];
    let score = 0;
    for (const t of terms) {
      const tf = d.filter((x) => x === t).length;
      if (!tf) continue;
      const idf = Math.log(1 + (N - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avgdl));
    }
    return { c, score };
  });

  let top = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  // Generic questions ("summarize this file") match nothing specific: use the beginning of the document.
  if (!top.length) top = scored.slice(0, k);
  return top
    .sort((a, b) => (a.c.id ?? 0) - (b.c.id ?? 0))
    .map(({ c }) => `[p. ${c.page}] ${c.content}`)
    .join("\n---\n");
}

/** Links PDFs uploaded before the chat existed to the new conversation. */
export async function attachDocuments(documentIds: string[], conversationId: string) {
  await db.documents
    .where("id")
    .anyOf(documentIds)
    .filter((d) => d.conversationId === null)
    .modify({ conversationId });
}
