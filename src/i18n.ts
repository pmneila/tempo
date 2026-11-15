import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";
export { useTranslation, I18nextProvider } from "react-i18next";
export const LANGUAGE_KEY = "tempo.language.v1";
export const resources = {
  en: { translation: en },
  es: { translation: es satisfies Record<keyof typeof en, string> },
};
export type Language = keyof typeof resources;
export const languageLabels: Record<Language, string> = {
  en: "English",
  es: "Español",
};
function supported(value: string): value is Language {
  return Object.hasOwn(resources, value);
}
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
export function detectLanguage(
  stored: string | null,
  languages: readonly string[],
): Language {
  if (stored && supported(stored)) return stored;
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (supported(base)) return base;
  }
  return "en";
}
export function initialLanguage(): Language {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LANGUAGE_KEY);
  } catch {}
  const languages =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  return detectLanguage(stored, languages);
}
export const i18n = createInstance();
// Bundled resources initialize synchronously, including in server-rendered tests.
void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  supportedLngs: Object.keys(resources),
  fallbackLng: "en",
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
export function updateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = i18n.resolvedLanguage || "en";
  document.title = i18n.t("pageTitle");
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", i18n.t("pageDescription"));
}
i18n.on("languageChanged", updateDocument);
export async function initializeLanguage() {
  await i18n.changeLanguage(initialLanguage());
  updateDocument();
}
export async function selectLanguage(language: Language): Promise<boolean> {
  await i18n.changeLanguage(language);
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
    return true;
  } catch {
    return false;
  }
}
