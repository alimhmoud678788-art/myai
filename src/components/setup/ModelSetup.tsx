import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelDownload,
  downloadModel,
  engineStatus,
  onDownloadProgress,
  setPreferredModel,
  systemInfo,
  type ModelId,
  type SystemInfo,
} from "../../lib/engine";
import { APP_NAME } from "../../lib/brand";
import { LANGUAGES } from "../../i18n";
import { setPrefs } from "../../lib/prefs";

const gb = (bytes: number) => (bytes / 1e9).toFixed(1);

/** Choose and download the AI model ("brain"). Shown on first run and from Settings → Change. */
export function ModelSetup({ onReady, onCancel }: { onReady: (id: ModelId) => void; onCancel?: () => void }) {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [installed, setInstalled] = useState<ModelId[]>([]);
  const [choice, setChoice] = useState<ModelId>("standard");
  const [progress, setProgress] = useState<{ done: number; total: number | null } | null>(null);
  const [speed, setSpeed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sample = useRef<{ t: number; done: number } | null>(null);

  useEffect(() => {
    systemInfo().then((s) => {
      setInfo(s);
      setChoice(s.totalRamGb > 0 && s.totalRamGb < 7.5 ? "lite" : "standard");
    });
    engineStatus().then((s) => setInstalled(s.installed));
    const un = onDownloadProgress((p) => {
      setProgress({ done: p.done, total: p.total });
      const now = Date.now();
      if (sample.current && now - sample.current.t > 1500) {
        setSpeed(((p.done - sample.current.done) / (now - sample.current.t)) * 1000);
        sample.current = { t: now, done: p.done };
      } else if (!sample.current) sample.current = { t: now, done: p.done };
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const start = async () => {
    setError(null);
    setPreferredModel(choice);
    if (installed.includes(choice)) return onReady(choice);
    setBusy(true);
    sample.current = null;
    try {
      await downloadModel(choice);
      onReady(choice);
    } catch (e) {
      const msg = String(e);
      if (msg !== "CANCELLED") setError(/DISK|space|No space/i.test(msg) ? t("errDisk") : t("downloadError"));
    } finally {
      setBusy(false);
    }
  };

  const pct = progress?.total ? Math.min(100, (progress.done / progress.total) * 100) : 0;
  const eta = progress?.total && speed > 0 ? Math.ceil((progress.total - progress.done) / speed / 60) : null;
  const ram = info?.totalRamGb ?? 0;

  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white">✦</div>
          <h1 className="text-2xl font-semibold">{t("setupTitle", { name: APP_NAME })}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("setupSubtitle")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(info?.models ?? []).map((m) => {
            const recommended = (ram === 0 || ram >= 7.5 ? "standard" : "lite") === m.id;
            const tooSmall = ram > 0 && ram < m.minRamGb - 0.5;
            return (
              <button
                key={m.id}
                disabled={busy}
                onClick={() => setChoice(m.id)}
                className={`rounded-xl border p-4 text-start transition ${
                  choice === m.id
                    ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:bg-blue-950"
                    : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t(m.id === "standard" ? "modelStandard" : "modelLite")}</span>
                  {recommended && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-200">{t("recommended")}</span>}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{t(m.id === "standard" ? "modelStandardDesc" : "modelLiteDesc")}</p>
                <p className="mt-2 text-xs text-zinc-400">
                  {installed.includes(m.id) ? `✓ ${t("installed")}` : t("downloadSize", { gb: gb(m.approxBytes) })} · {t("needsRam", { gb: m.minRamGb })}
                </p>
                {tooSmall && <p className="mt-1 text-xs text-amber-600">{t("ramWarning")}</p>}
              </button>
            );
          })}
        </div>

        {ram > 0 && <p className="text-center text-xs text-zinc-500">{t("yourRam", { gb: ram })}</p>}

        {busy && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-zinc-500" dir="ltr">
              <span>{progress ? `${gb(progress.done)} / ${progress.total ? gb(progress.total) : "?"} GB` : "…"}</span>
              <span>
                {pct.toFixed(0)}%{speed > 0 && ` · ${(speed / 1e6).toFixed(1)} MB/s`}
                {eta !== null && ` · ~${eta} min`}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {busy ? (
            <button onClick={() => cancelDownload()} className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700">
              {t("pause")}
            </button>
          ) : (
            <>
              <button onClick={start} className="w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white">
                {installed.includes(choice) ? t("useThis") : progress ? t("resume") : t("download")}
              </button>
              {onCancel && (
                <button onClick={onCancel} className="rounded-lg border border-zinc-300 px-4 py-2 dark:border-zinc-700">
                  {t("back")}
                </button>
              )}
            </>
          )}
        </div>

        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        <p className="text-center text-xs text-zinc-500">🔒 {t("offlineNote")}</p>

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
