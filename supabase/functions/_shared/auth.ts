import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { json } from "./cors.ts";

/**
 * A client that acts AS the calling user, so Row Level Security applies to every query.
 * We never use the service_role key in these functions.
 */
export async function getUserClient(req: Request) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw json({ error: "Unauthorized" }, 401);
  return { supabase, user };
}

const LIMITS: Record<string, number> = {
  chat: Number(Deno.env.get("CHAT_DAILY_LIMIT") ?? 200),
  image: Number(Deno.env.get("IMAGE_DAILY_LIMIT") ?? 20),
  ingest: Number(Deno.env.get("INGEST_DAILY_LIMIT") ?? 20),
};

export async function consumeQuota(supabase: SupabaseClient, kind: keyof typeof LIMITS) {
  const { data, error } = await supabase.rpc("consume_quota", { p_kind: kind, p_limit: LIMITS[kind] });
  if (error) throw error;
  if (data !== true) throw json({ error: "Daily limit reached. Try again tomorrow." }, 429);
}

export async function ensureConversation(
  supabase: SupabaseClient,
  userId: string,
  id: string | undefined,
  firstMessage: string,
) {
  if (id) return id;
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
