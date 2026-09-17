import type { i18n as I18n } from "i18next";

/**
 * The instance created in createI18n(), assigned at startup and read by
 * non-hook callers (the shell's locale switcher reads the current language
 * outside a useTranslation render path). Components inside React always use
 * useTranslation; this exists so direction switching does not need context
 * plumbing through every tree.
 */
export let i18n: I18n;

export function setI18n(instance: I18n): void {
  i18n = instance;
}
