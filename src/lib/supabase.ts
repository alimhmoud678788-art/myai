import { createClient } from "@supabase/supabase-js";
import { LazyStore } from "@tauri-apps/plugin-store";

// Session lives in the app's AppData folder (shared by both windows), not in browser localStorage.
const store = new LazyStore("session.json");
const tauriStorage = {
  getItem: async (k: string) => (await store.get<string>(k)) ?? null,
  setItem: async (k: string, v: string) => {
    await store.set(k, v);
    await store.save();
  },
  removeItem: async (k: string) => {
    await store.delete(k);
    await store.save();
  },
};

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
// The anon key is public by design; Row Level Security protects the data.
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: tauriStorage,
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
