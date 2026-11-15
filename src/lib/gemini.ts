import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import type { Source } from "./db";

/**
 * Bring-your-own-key client. The user's key is stored in Windows Credential Manager (via Rust)
 * and calls go straight from this PC to Google — there is no middle server.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// ───────────── API key (Windows Credential Manager) ─────────────
let cachedKey: string | null | undefined;

export async function getApiKey(): Promise<string | null> {
  if (cachedKey === undefined) cachedKey = (await invoke<string | null>("get_api_key")) ?? null;
  return cachedKey;
}

export async function saveApiKey(key: string) {
  const models = await resolveModels(key); // throws if the key is invalid
  await invoke("set_api_key", { key });
  cachedKey = key;
  return models;
}

export async function removeApiKey() {
  await invoke("delete_api_key");
  cachedKey = null;
  localStorage.removeItem(MODELS_KEY);
}

// ───────────── Errors ─────────────
export class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Turns API failures into a short message in the user's language. */
export function friendlyError(e: unknown): string {
  if (e instanceof GeminiError) {
    const detail = e.message ? `\n\n> Google (${e.status}): ${e.message.replace(/\s+/g, " ").slice(0, 300)}` : "";
    if (e.status === 400 && /api key/i.test(e.message)) return i18n.t("errKey");
    if (e.status === 401 || e.status === 403) return i18n.t("errKey") + detail;
    if (e.status === 429) return i18n.t("errQuota") + detail;
    if (e.status >= 500) return i18n.t("errServer") + detail;
    return e.message;
  }
  if (e instanceof TypeError) return i18n.t("errNetwork"); // fetch failed: offline / blocked
  return (e as Error)?.message || i18n.t("error");
}

async function request(path: string, key: string, init?: { body?: unknown; signal?: AbortSignal }) {
  const res = await fetch(`${BASE}/${path}`, {
    method: init?.body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init?.signal,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new GeminiError(res.status, msg);
  }
  return res;
}

async function keyOrThrow() {
  const key = await getApiKey();
  if (!key) throw new GeminiError(401, "No API key");
  return key;
}

// ───────────── Model discovery ─────────────
// Model names change over time, so we pick the best available ones from the user's key.
export type Models = {
  chat: string; // the model that worked last (first candidate)
  chatCandidates: string[]; // tried in order when a model is out of free quota / overloaded / gone
  embed: string;
  image: string | null;
  checkedAt: number;
};
const MODELS_KEY = "models";
const WEEK = 7 * 24 * 3600 * 1000;

type ApiModel = { name: string; supportedGenerationMethods?: string[] };

const version = (name: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 0);
const unstable = (n: string) => /(preview|exp|experimental|\d{2}-\d{2})/.test(n);
const pickBest = (names: string[]) =>
  [...names].sort((a, b) => Number(unstable(a)) - Number(unstable(b)) || version(b) - version(a) || a.length - b.length)[0];

const SPECIAL = /(image|tts|audio|live|vision|thinking|robotics|computer|nano|gemma|learnlm|aqa|embedding)/;

/** Lower = preferred. Stable Flash first (best free tier), then Flash-Lite, aliases, previews, Pro. */
function chatTier(n: string) {
  if (/^gemini-[\d.]+-flash$/.test(n)) return 0;
  if (/^gemini-[\d.]+-flash-lite$/.test(n)) return 1;
  if (/^gemini-flash(-lite)?-latest$/.test(n)) return 2;
  if (/flash/.test(n)) return unstable(n) ? 4 : 3;
  if (/pro/.test(n)) return unstable(n) ? 6 : 5;
  return 7;
}

export function chooseModels(models: ApiModel[]): Omit<Models, "checkedAt"> {
  const strip = (n: string) => n.replace("models/", "");
  const gen = models.filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => strip(m.name));
  const emb = models.filter((m) => m.supportedGenerationMethods?.includes("embedContent")).map((m) => strip(m.name));

  const chatCandidates = gen
    .filter((n) => /^gemini/.test(n) && !SPECIAL.test(n))
    .sort((a, b) => chatTier(a) - chatTier(b) || version(b) - version(a) || a.length - b.length)
    .slice(0, 8);
  const embed = pickBest(emb.filter((n) => /gemini-embedding/.test(n))) ?? pickBest(emb);
  const image = pickBest(gen.filter((n) => /gemini.*image/.test(n))) ?? null;

  if (!chatCandidates.length || !embed) throw new GeminiError(404, "No suitable Gemini models are available for this API key.");
  return { chat: chatCandidates[0], chatCandidates, embed, image };
}

function saveModels(m: Models) {
  localStorage.setItem(MODELS_KEY, JSON.stringify(m));
}

export async function resolveModels(key: string): Promise<Models> {
  const res = await request("models?pageSize=1000", key);
  const { models = [] } = (await res.json()) as { models?: ApiModel[] };
  const chosen: Models = { ...chooseModels(models), checkedAt: Date.now() };
  saveModels(chosen);
  return chosen;
}

export async function getModels(): Promise<Models> {
  try {
    const cached = JSON.parse(localStorage.getItem(MODELS_KEY) ?? "null") as Models | null;
    if (cached?.chatCandidates?.length && Date.now() - cached.checkedAt < WEEK) return cached;
  } catch {
    /* ignore */
  }
  return resolveModels(await keyOrThrow());
}

// ───────────── Chat (streaming) ─────────────
/** Model-specific failures worth trying the next model for: not found, quota, overloaded. */
const RETRYABLE = new Set([404, 429, 500, 503, 504]);

const SYSTEM = `You are MyAI, a helpful, concise assistant running as a Windows desktop app.
- Always reply in the same language the user writes in (Arabic, English, or other).
- Format answers in Markdown. Put code in fenced blocks with a language tag.
- When "Document context" is provided, answer from it and cite pages like [p. 3]. If the answer is not in the context, say so clearly.`;

export type Turn = { role: "user" | "model"; text: string };
export type StreamEvent = { type: "delta"; text: string } | { type: "sources"; sources: Source[] };

type GroundingChunk = { web?: { uri?: string; title?: string } };

export async function* streamChat(turns: Turn[], opts: { webSearch?: boolean; signal?: AbortSignal } = {}): AsyncGenerator<StreamEvent> {
  const key = await keyOrThrow();
  const models = await getModels();
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature: 0.7 },
  };
  if (opts.webSearch) body.tools = [{ google_search: {} }];

  // Try models in order until one accepts the request (free-tier quota and load differ per model).
  let res: Response | undefined;
  let lastErr: unknown;
  for (const model of models.chatCandidates) {
    try {
      res = await request(`models/${model}:streamGenerateContent?alt=sse`, key, { body, signal: opts.signal });
      if (model !== models.chatCandidates[0]) {
        saveModels({ ...models, chat: model, chatCandidates: [model, ...models.chatCandidates.filter((m) => m !== model)] });
      }
      break;
    } catch (e) {
      lastErr = e;
      if (!(e instanceof GeminiError) || !RETRYABLE.has(e.status)) throw e;
    }
  }
  if (!res) throw lastErr;
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const sources = new Map<string, string>();
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
      const text = (cand?.content?.parts ?? []).map((p: { text?: string; thought?: boolean }) => (p.thought ? "" : p.text ?? "")).join("");
      if (text) yield { type: "delta", text };
      for (const g of (cand?.groundingMetadata?.groundingChunks ?? []) as GroundingChunk[]) {
        if (g.web?.uri) sources.set(g.web.uri, g.web.title ?? g.web.uri);
      }
    }
  }
  if (sources.size) yield { type: "sources", sources: [...sources].map(([uri, title]) => ({ uri, title })) };
}

// ───────────── Embeddings (PDF RAG) ─────────────
export async function embed(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY", onProgress?: (done: number) => void) {
  const key = await keyOrThrow();
  const { embed: model } = await getModels();
  const dims = /gemini-embedding/.test(model) ? { outputDimensionality: 768 } : {};
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await request(`models/${model}:batchEmbedContents`, key, {
      body: {
        requests: texts.slice(i, i + 100).map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType,
          ...dims,
        })),
      },
    });
    const data = (await res.json()) as { embeddings: { values: number[] }[] };
    out.push(...data.embeddings.map((e) => Float32Array.from(e.values)));
    onProgress?.(out.length);
  }
  return { vectors: out, model };
}

// ───────────── Image generation ─────────────
export async function generateImage(prompt: string): Promise<Blob> {
  const key = await keyOrThrow();
  const { image } = await getModels();
  if (!image) throw new GeminiError(404, i18n.t("errNoImageModel"));
  const res = await request(`models/${image}:generateContent`, key, {
    body: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    },
  });
  const data = await res.json();
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = data.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData)?.inlineData;
  if (!img) {
    const reason = parts.map((p) => p.text ?? "").join(" ").trim();
    throw new GeminiError(422, reason || i18n.t("errImageBlocked"));
  }
  const bin = atob(img.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: img.mimeType });
}
