import { createInstance, type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { setI18n } from "./instance.js";
import en from "./en.json";
import fa from "./fa.json";

/**
 * English and Persian are both first-class (docs/19-tech-stack.md).
 *
 * The active locale drives two things beyond translations, and both live here
 * so no component can forget them:
 * - `dir` on <html> -- every logical property in the stylesheet resolves from
 *   it, which is how RTL works with no per-component work.
 * - `lang` on <html> -- screen readers must follow the switch too.
 *
 * The choice persists in localStorage; it is a UI preference, never a secret
 * or a credential, and nothing else is stored there.
 */

export const SUPPORTED_LOCALES = ["en", "fa"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: Locale = "en";
const STORAGE_KEY = "nuraai.locale";

const resources = {
  en: { translation: en },
  fa: { translation: fa },
};

function normalize(value: string | null): Locale | null {
  if (value === null) return null;
  // Accept "fa", "fa-IR", "en-GB"; pick the language part.
  const base = value.split("-")[0]?.toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(base ?? "") ? (base as Locale) : null;
}

function initialLocale(): Locale {
  try {
    const stored = normalize(window.localStorage.getItem(STORAGE_KEY));
    if (stored !== null) return stored;
  } catch {
    // Storage can be unavailable (private mode, blocked); fall through.
  }
  return normalize(window.navigator.language) ?? DEFAULT_LOCALE;
}

export function currentLocale(i18n: I18n): Locale {
  return normalize(i18n.language) ?? DEFAULT_LOCALE;
}

export function isRtl(locale: Locale): boolean {
  return locale === "fa";
}

/** Persist the choice, then flip dir/lang on <html> in the same call. */
export function changeLocale(i18n: I18n, locale: Locale): void {
  void i18n.changeLanguage(locale);
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Preference is best-effort; the UI still switches for this visit.
  }
  applyDocumentDirection(locale);
}

export function applyDocumentDirection(locale: Locale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
}

export async function createI18n(): Promise<I18n> {
  const instance = createInstance();
  await instance.use(initReactI18next).init({
    resources,
    lng: initialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    // Everything user-facing goes through a key; a missing key is a bug, and
    // showing the key itself makes it visible in review rather than silently
    // rendering English.
    returnNull: false,
    interpolation: { escapeValue: false },
  });
  setI18n(instance);
  applyDocumentDirection(currentLocale(instance));
  return instance;
}
