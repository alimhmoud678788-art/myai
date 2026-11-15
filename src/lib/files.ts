import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

/** Native "Save as" dialog, then writes the image to the chosen path on disk. */
export async function saveImage(image: Blob) {
  const ext = image.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const path = await save({
    defaultPath: `myai-${Date.now()}.${ext}`,
    filters: [{ name: "Image", extensions: [ext] }],
  });
  if (!path) return false;
  await writeFile(path, new Uint8Array(await image.arrayBuffer()));
  return true;
}
