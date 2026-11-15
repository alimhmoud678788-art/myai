import { openUrl } from "@tauri-apps/plugin-opener";
import type { MouseEvent } from "react";

/** Tauri webviews don't open target=_blank links; route them to the default browser. */
export function openExternal(e: MouseEvent<HTMLAnchorElement>) {
  const href = e.currentTarget.href;
  if (!/^https?:|^mailto:/i.test(href)) return;
  e.preventDefault();
  openUrl(href).catch(console.error);
}
