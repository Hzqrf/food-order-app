import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";

import en from "../locales/en.json";
import ms from "../locales/ms.json";

export const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "ms", label: "BM" },
] as const;
export type Lang = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "lang";

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "ms") return v;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith("ms") ? "ms" : "en";
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ms: { translation: ms } },
  lng: storedLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes
});
document.documentElement.lang = i18n.language;

export function setLanguage(lang: Lang) {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
}

/** Menu content carries an optional Malay name; fall back to English when it is missing. */
export function useLocalized() {
  const { i18n: inst } = useTranslation();
  const ms = inst.language === "ms";
  return {
    name: (o: { name: string; name_ms?: string | null }) => (ms && o.name_ms ? o.name_ms : o.name),
    description: (o: { description?: string | null; description_ms?: string | null }) =>
      (ms && o.description_ms ? o.description_ms : o.description) ?? "",
  };
}

export default i18n;
