import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "../lib/supabase";

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    // The other window signed in/out: reload so this window re-reads the shared session store.
    const un = listen("auth-changed", () => location.reload());
    return () => {
      sub.subscription.unsubscribe();
      un.then((f) => f());
    };
  }, []);

  return session;
}
