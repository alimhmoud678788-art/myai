import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import i18n from "../i18n";
import { APP_NAME } from "./brand";

/** Client for the local AI engine (llama.cpp's llama-server, started by the Rust side on 127.0.0.1). */
export type ModelId = "standard" | "lite";
export type EngineStatus = {
  installed: ModelId[];
  active: ModelId | null;
  running: boolean;
  exited: boolean;
  port: number;
  apiKey: string;
  downloading: boolean;
};
export type SystemInfo = {
  totalRamGb: number;
  threads: number;
  models: { id: ModelId; approxBytes: number; minRamGb: number }[];
};
export type Progress = { id: ModelId; done: number; total: number | null };

export const systemInfo = () => invoke<SystemInfo>("system_info");
export const engineStatus = () => invoke<EngineStatus>("engine_status");
export const startEngine = (id: ModelId) => invoke<EngineStatus>("start_engine", { id });
export const downloadModel = (id: ModelId) => invoke<void>("download_model", { id });
export const cancelDownload = () => invoke<void>("cancel_download");
export const deleteModel = (id: ModelId) => invoke<void>("delete_model", { id });
export const engineLogTail = () => invoke<string>("engine_log_tail");
export const onDownloadProgress = (cb: (p: Progress) => void) => listen<Progress>("download-progress", (e) => cb(e.payload));

const PREF = "model";
export const preferredModel = (): ModelId | null => {
  try {
    return localStorage.getItem(PREF) as ModelId | null;
  } catch {
    return null;
  }
};
export const setPreferredModel = (id: ModelId) => {
  try {
    localStorage.setItem(PREF, id);
  } catch {
    /* ignore */
  }
};

export class EngineError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls /health until the model is loaded (200), or fails if the engine process died. */
export async function waitUntilReady(timeoutMs = 5 * 60_000): Promise<EngineStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await engineStatus();
    if (st.exited || (!st.running && st.active === null)) throw new EngineError("ENGINE_EXITED");
    if (st.running && st.port) {
      try {
        const res = await fetch(`http://127.0.0.1:${st.port}/health`);
        if (res.ok) return st;
      } catch {
        /* still starting */
      }
    }
    await sleep(500);
  }
  throw new EngineError("ENGINE_TIMEOUT");
}

// ───────────── Chat (OpenAI-compatible streaming) ─────────────
export const SYSTEM_PROMPT = `You are ${APP_NAME}, a helpful, friendly assistant built into the ${APP_NAME} desktop app. You run privately on the user's own computer.
- Always reply in the same language the user writes in. If the user writes in Egyptian Arabic, you may reply in Egyptian Arabic; otherwise use clear Modern Standard Arabic for Arabic.
- Be concise and accurate. If you are not sure about something, say so instead of guessing.
- Format answers in Markdown. Put code in fenced blocks with a language tag.
- When "Document context" is provided, answer from it and cite pages like [p. 3]. If the answer is not in the context, say so clearly.
- Your name is ${APP_NAME}.`;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Hides <think>…</think> reasoning blocks some models emit before the answer. */
function thinkFilter() {
  let inThink = false;
  let buf = "";
  return (piece: string) => {
    buf += piece;
    let out = "";
    while (buf) {
      if (inThink) {
        const end = buf.indexOf("</think>");
        if (end < 0) {
          buf = buf.slice(Math.max(0, buf.length - 8));
          return out;
        }
        buf = buf.slice(end + 8).replace(/^\s+/, "");
        inThink = false;
      } else {
        const start = buf.indexOf("<think>");
        if (start < 0) {
          // keep a possible partial "<think" tag at the end
          const keep = buf.lastIndexOf("<");
          if (keep >= 0 && "<think>".startsWith(buf.slice(keep))) {
            out += buf.slice(0, keep);
            buf = buf.slice(keep);
            return out;
          }
          out += buf;
          buf = "";
          return out;
        }
        out += buf.slice(0, start);
        buf = buf.slice(start + 7);
        inThink = true;
      }
    }
    return out;
  };
}

export async function* streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const st = await engineStatus();
  if (!st.running) throw new EngineError("ENGINE_NOT_RUNNING");
  const res = await fetch(`http://127.0.0.1:${st.port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${st.apiKey}` },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.7,
      top_p: 0.8,
      max_tokens: 2048,
      cache_prompt: true,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new EngineError(res.status === 400 && /context|too long|exceed/i.test(msg) ? "CONTEXT_TOO_LONG" : msg);
  }

  const filter = thinkFilter();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value.replace(/\r/g, "");
    let i: number;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const evt = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of evt.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        const json = JSON.parse(data);
        if (json.error) throw new EngineError(json.error.message ?? "error");
        const piece = filter(json.choices?.[0]?.delta?.content ?? "");
        if (piece) yield piece;
      }
    }
  }
}

export function friendlyError(e: unknown): string {
  const msg = (e as Error)?.message ?? "";
  if (msg === "CONTEXT_TOO_LONG") return i18n.t("errContext");
  if (/ENGINE_/.test(msg) || e instanceof TypeError) return i18n.t("errEngine");
  return msg || i18n.t("error");
}
