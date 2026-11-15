import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { friendlyError } from "../../lib/gemini";

export type Doc = { id: string; name: string };

type Props = {
  busy: boolean;
  onSend: (text: string, opts: { webSearch: boolean; documentIds: string[] }) => void;
  onStop: () => void;
  conversationId?: string;
  initialDocs?: Doc[];
  autoFocus?: boolean;
  compact?: boolean;
};

export function Composer({ busy, onSend, onStop, conversationId, initialDocs = [], autoFocus, compact }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [web, setWeb] = useState(false);
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || busy || uploading !== null) return;
    onSend(value, { webSearch: web, documentIds: docs.map((d) => d.id) });
    setText("");
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploading(0);
    try {
      const { ingestPdf } = await import("../../lib/pdf"); // pdf.js loads on first use only
      const doc = await ingestPdf(file, conversationId ?? null, setUploading);
      setDocs((d) => [...d, doc]);
    } catch (e) {
      const msg = (e as Error).message;
      alert(msg === "NO_TEXT" ? t("pdfNoText") : msg === "PDF_TOO_LARGE" ? t("pdfTooLarge") : friendlyError(e));
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={`border-t border-zinc-200 dark:border-zinc-800 ${compact ? "p-2" : "p-3"}`}>
      <div className="mx-auto max-w-3xl">
        {docs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {docs.map((d) => (
              <span key={d.id} className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                📄 <span className="max-w-48 truncate">{d.name}</span>
                <button
                  onClick={() => setDocs((all) => all.filter((x) => x.id !== d.id))}
                  className="ms-1 text-zinc-400 hover:text-red-500"
                  aria-label="remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          dir="auto"
          rows={compact ? 1 : 2}
          value={text}
          autoFocus={autoFocus}
          placeholder={t("placeholder")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none rounded-xl border border-zinc-300 bg-transparent p-3 outline-none focus:border-blue-500 dark:border-zinc-700"
        />
        <div className="mt-2 flex items-center gap-3 text-sm">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading !== null}
            className="rounded-lg px-2 py-1 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            📎 {uploading !== null ? `${t("uploading")} ${uploading}%` : t("attachPdf")}
          </button>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <label className="flex cursor-pointer items-center gap-1 select-none">
            <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} />
            🌐 {t("webSearch")}
          </label>
          <span className="ms-auto" />
          {busy ? (
            <button onClick={onStop} className="rounded-lg bg-zinc-200 px-4 py-1.5 dark:bg-zinc-700">
              {t("stop")}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim() || uploading !== null}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-white disabled:opacity-40"
            >
              {t("send")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
