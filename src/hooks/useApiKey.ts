import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getApiKey } from "../lib/gemini";

/** undefined = loading, false = no key yet, true = ready. Synced across both windows. */
export function useApiKey() {
  const [ready, setReady] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    getApiKey()
      .then((k) => setReady(!!k))
      .catch(() => setReady(false));
    // The key was added/removed in the other window: reload to re-read it.
    const un = listen("key-changed", () => location.reload());
    return () => {
      un.then((f) => f());
    };
  }, []);

  const markReady = () => {
    setReady(true);
    emit("key-changed").catch(() => {});
  };
  return { ready, markReady };
}
