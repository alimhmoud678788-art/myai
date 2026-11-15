import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

export const LANGUAGES = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
] as const;

const RTL = ["ar", "he", "fa", "ur"];

export function applyDir(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = RTL.includes(lng) ? "rtl" : "ltr";
}

let saved: string | null = null;
try {
  saved = localStorage.getItem("lang");
} catch {
  /* ignore */
}

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: saved ?? (navigator.language.startsWith("ar") ? "ar" : "en"),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

applyDir(i18n.language);
i18n.on("languageChanged", (l) => {
  applyDir(l);
  try {
    localStorage.setItem("lang", l);
  } catch {
    /* ignore */
  }
});

export default i18n;
