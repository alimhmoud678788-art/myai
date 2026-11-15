import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Checks GitHub Releases (latest.json), downloads silently in the background,
 * then lets the UI offer "install & restart". Signature is verified by the plugin.
 */
export async function downloadUpdate(): Promise<Update | null> {
  try {
    const update = await check();
    if (!update) return null;
    await update.download();
    return update;
  } catch (e) {
    console.warn("Update check failed", e);
    return null;
  }
}

export async function installAndRestart(update: Update) {
  await update.install();
  await relaunch();
}
