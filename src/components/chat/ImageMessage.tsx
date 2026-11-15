import { useState } from "react";
import { useTranslation } from "react-i18next";
import { saveImage } from "../../lib/files";

export function ImageMessage({ url }: { url: string }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);

  const onSave = async () => {
    try {
      if (await saveImage(url)) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <figure className="max-w-md">
      <img src={url} alt="" className="rounded-xl border border-zinc-200 dark:border-zinc-800" />
      <button
        onClick={onSave}
        className="mt-2 rounded-lg border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        💾 {saved ? t("saved") : t("saveImage")}
      </button>
    </figure>
  );
}
