import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { db } from "./db";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type Page = { page: number; text: string };
export type Chunk = { page: number; content: string };

/** Text extraction runs locally — the PDF itself never leaves the user's PC. */
export async function extractPdf(file: File): Promise<Page[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: Page[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    const text = tc.items
      .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text) pages.push({ page: i, text });
  }
  await pdf.loadingTask.destroy();
  return pages;
}

export function chunkPages(pages: Page[], size = 1200, overlap = 200): Chunk[] {
  const out: Chunk[] = [];
  for (const { page, text } of pages) {
    for (let i = 0; i < text.length; i += size - overlap) {
      out.push({ page, content: text.slice(i, i + size) });
      if (i + size >= text.length) break;
    }
  }
  return out;
}

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_CHUNKS = 5000;

/** Reads the PDF and stores its text chunks in the local DB — fully offline. */
export async function ingestPdf(file: File, conversationId: string | null) {
  if (file.size > MAX_PDF_BYTES) throw new Error("PDF_TOO_LARGE");
  const pages = await extractPdf(file);
  if (!pages.length) throw new Error("NO_TEXT"); // scanned PDF → needs OCR
  const chunks = chunkPages(pages);
  if (chunks.length > MAX_CHUNKS) throw new Error("PDF_TOO_LARGE");

  const id = crypto.randomUUID();
  await db.transaction("rw", [db.documents, db.chunks], async () => {
    await db.documents.add({ id, conversationId, name: file.name, createdAt: Date.now() });
    await db.chunks.bulkAdd(chunks.map((c) => ({ documentId: id, page: c.page, content: c.content })));
  });
  return { id, name: file.name };
}
