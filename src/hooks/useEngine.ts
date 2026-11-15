import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { engineLogTail, engineStatus, preferredModel, startEngine, waitUntilReady, type ModelId } from "../lib/engine";

export type Phase =
  | { kind: "checking" }
  | { kind: "setup" } // no model downloaded yet
  | { kind: "starting" } // loading the model into memory
  | { kind: "ready" }
  | { kind: "error"; log: string };

const isMain = getCurrentWindow().label === "main";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The main window owns the engine (starts it); the quick window only waits for it.
 */
export function useEngine() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  const boot = useCallback(async (requested?: ModelId) => {
    try {
      let st = await engineStatus();
      if (!st.installed.length) {
        setPhase({ kind: "setup" });
        return;
      }
      setPhase({ kind: "starting" });
      if (isMain) {
        const pref = requested ?? preferredModel();
        const id = pref && st.installed.includes(pref) ? pref : st.installed[0];
        await startEngine(id);
      } else {
        while (!(st = await engineStatus()).running) await sleep(1000);
      }
      await waitUntilReady();
      setPhase({ kind: "ready" });
    } catch (e) {
      const log = await engineLogTail().catch(() => "");
      setPhase({ kind: "error", log: `${(e as Error)?.message ?? e}\n${log}`.trim() });
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  return { phase, boot, openSetup: () => setPhase({ kind: "setup" }) };
}
