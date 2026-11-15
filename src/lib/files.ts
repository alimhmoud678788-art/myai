import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

/** Native "Save as" dialog, then writes the image to the chosen path on disk. */
export async function saveImage(url: string, name = `myai-${Date.now()}.png`) {
  const path = await save({
    defaultPath: name,
    filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (!path) return false;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await writeFile(path, new Uint8Array(await res.arrayBuffer()));
  return true;
}
