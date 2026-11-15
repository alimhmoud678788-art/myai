import { useTranslation } from "react-i18next";
import type { Source } from "../../lib/api";
import { openExternal } from "../../lib/links";

export function Sources({ sources }: { sources: Source[] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 border-t border-zinc-200 pt-2 text-sm dark:border-zinc-800">
      <div className="mb-1 font-semibold text-zinc-500">🔗 {t("sources")}</div>
      <ol className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <li key={s.uri}>
            <a
              href={s.uri}
              onClick={openExternal}
              title={s.uri}
              className="inline-block max-w-64 truncate rounded-full bg-zinc-100 px-3 py-1 text-xs hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            >
              {i + 1}. {s.title}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
