import i18n from "i18next";
import { initReactI18next } from "react-i18next";

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

export default i18n;
