import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { friendlyError, saveApiKey } from "../../lib/gemini";
import { LANGUAGES } from "../../i18n";
import { setPrefs } from "../../lib/prefs";

const KEY_URL = "https://aistudio.google.com/apikey";

/** First-run screen: the user pastes their own free Gemini API key. */
export function KeySetup({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveApiKey(key.trim());
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white">✦</div>
          <h1 className="text-2xl font-semibold">{t("setupTitle")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("setupSubtitle")}</p>
        </div>

        <ol className="list-decimal space-y-2 rounded-xl bg-zinc-50 p-4 ps-8 text-sm dark:bg-zinc-900">
          <li>
            {t("setupStep1")}{" "}
            <button type="button" onClick={() => openUrl(KEY_URL)} className="font-medium text-blue-600 underline">
              aistudio.google.com/apikey
            </button>
          </li>
          <li>{t("setupStep2")}</li>
          <li>{t("setupStep3")}</li>
        </ol>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            dir="ltr"
            type="password"
            autoFocus
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza..."
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono outline-none focus:border-blue-500 dark:border-zinc-700"
          />
          <button disabled={busy || !key.trim()} className="w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50">
            {busy ? t("checking") : t("start")}
          </button>
        </form>

        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        <p className="text-center text-xs text-zinc-500">🔒 {t("keyPrivacy")}</p>

        <div className="flex justify-center gap-3 text-xs">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setPrefs({ lang: l.code })}
              className={i18n.language === l.code ? "font-semibold" : "text-zinc-500"}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
