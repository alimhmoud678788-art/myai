import { supabase, SUPABASE_URL, SUPABASE_ANON } from "./supabase";

const FN = `${SUPABASE_URL}/functions/v1`;

export type Source = { uri: string; title: string };
export type ChatEvent =
  | { type: "meta"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "sources"; sources: Source[] }
  | { type: "done" }
  | { type: "error"; message: string };

async function headers() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("NOT_AUTHENTICATED");
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    apikey: SUPABASE_ANON,
    "Content-Type": "application/json",
  };
}

async function errorText(res: Response) {
  try {
    const j = await res.json();
    return j.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function callFn<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${FN}/${name}`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return (await res.json()) as T;
}

export type ChatRequest = {
  conversationId?: string;
  message: string;
  webSearch?: boolean;
  documentIds?: string[];
};

/** Streams Server-Sent Events from the `chat` edge function. */
export async function* streamChat(body: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${FN}/chat`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await errorText(res));

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
        if (line.startsWith("data: ")) yield JSON.parse(line.slice(6)) as ChatEvent;
      }
    }
  }
}

export const generateImage = (prompt: string, conversationId?: string) =>
  callFn<{ conversationId: string; url: string; path: string }>("image", { prompt, conversationId });

export async function signedImageUrl(path: string) {
  const { data } = await supabase.storage.from("generated-images").createSignedUrl(path, 3600);
  return data?.signedUrl;
}
