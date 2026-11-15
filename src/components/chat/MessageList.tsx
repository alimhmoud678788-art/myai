import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Msg } from "../../hooks/useChat";
import { Markdown } from "./Markdown";
import { Sources } from "./Sources";
import { ImageMessage } from "./ImageMessage";

export function MessageList({ messages, busy, compact = false }: { messages: Msg[]; busy: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (!messages.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <h2 className={compact ? "text-lg font-semibold" : "text-2xl font-semibold"}>{t("emptyTitle")}</h2>
        {!compact && <p className="mt-2 max-w-md text-sm text-zinc-500">{t("emptyHint")}</p>}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={`mx-auto flex max-w-3xl flex-col gap-4 ${compact ? "px-3 py-2" : "px-4 py-6"}`}>
        {messages.map((m, i) => {
          const last = i === messages.length - 1;
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div
                  dir="auto"
                  className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-white"
                >
                  {m.content}
                </div>
              </div>
            );
          }
          const waiting = busy && last && !m.content && !m.imageUrl;
          return (
            <div key={m.id} className={m.error ? "text-red-600 dark:text-red-400" : ""}>
              {waiting && <span className="animate-pulse text-zinc-500">{t("thinking")}</span>}
              {m.imageUrl && <ImageMessage url={m.imageUrl} />}
              {m.content && <Markdown content={m.content} />}
              {m.sources && <Sources sources={m.sources} />}
            </div>
          );
        })}
        <div ref={end} />
      </div>
    </div>
  );
}
