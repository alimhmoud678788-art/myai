import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sendEmailCode, signInWithGoogle, verifyEmailCode } from "../../lib/auth";
import { LANGUAGES } from "../../i18n";
import { setPrefs } from "../../lib/prefs";

export function Login() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || t("error"));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-blue-500 dark:border-zinc-700";
  const primary = "w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50";

  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">{t("signInTitle")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("signInSubtitle")}</p>
        </div>

        <button
          disabled={busy}
          onClick={() => run(async () => {
            await signInWithGoogle();
            setInfo(t("googleOpened"));
          })}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span className="font-bold text-blue-600">G</span> {t("continueGoogle")}
        </button>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <hr className="flex-1 border-zinc-200 dark:border-zinc-800" /> {t("or")}
          <hr className="flex-1 border-zinc-200 dark:border-zinc-800" />
        </div>

        {step === "email" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await sendEmailCode(email.trim());
                setStep("code");
                setInfo(t("codeSent", { email: email.trim() }));
              });
            }}
          >
            <input dir="ltr" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")} className={input} />
            <button disabled={busy} className={primary}>{t("sendCode")}</button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => verifyEmailCode(email.trim(), code.trim()));
            }}
          >
            <input
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("code")}
              className={`${input} text-center font-mono tracking-[0.4em]`}
            />
            <button disabled={busy} className={primary}>{t("verify")}</button>
            <button type="button" onClick={() => { setStep("email"); setInfo(null); }} className="w-full text-sm text-zinc-500">
              {t("back")}
            </button>
          </form>
        )}

        {info && <p className="text-center text-sm text-zinc-500">{info}</p>}
        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        <div className="flex justify-center gap-3 text-xs">
          {LANGUAGES.map((l) => (
            <button key={l.code} onClick={() => setPrefs({ lang: l.code })} className={i18n.language === l.code ? "font-semibold" : "text-zinc-500"}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
