import { ApiError } from '@/apis/client';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALES, RLM } from '@/libs/constant';
import { DICTIONARIES, type MessageKey } from '@/locales';

type Values = Record<string, string | number>;

type PluralKey = MessageKey extends infer K
    ? K extends `${infer Base}.other`
        ? Base
        : never
    : never;

export function detectLocale(preferred: readonly string[], chosen: string | null): string {
    for (const tag of [chosen ?? '', ...preferred]) {
        const base = tag.toLowerCase().split('-')[0];

        if (LOCALES.some((entry) => entry.code === base)) {
            return base;
        }
    }

    return DEFAULT_LOCALE;
}

function storedLocale(): string | null {
    try {
        return localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function chooseLocale(code: string): void {
    try {
        localStorage.setItem(LOCALE_STORAGE_KEY, code);
    } catch {
        return;
    }

    location.reload();
}

export const locale = detectLocale(
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]),
    storedLocale(),
);

export const direction = LOCALES.find((entry) => entry.code === locale)?.dir ?? 'ltr';

export const region =
    (typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])).find(
        (tag) => tag.toLowerCase().split('-')[0] === locale,
    ) ?? locale;

const messages = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
const fallback = DICTIONARIES[DEFAULT_LOCALE];
const plurals = new Intl.PluralRules(locale);
const numbers = new Intl.NumberFormat(locale);

function fill(text: string, values?: Values): string {
    const lead = direction === 'rtl' ? RLM : '';

    if (values === undefined) {
        return lead + text;
    }

    return (
        lead +
        text.replace(/\{(\w+)\}/g, (whole, name: string) => {
            const value = values[name];

            return value === undefined
                ? whole
                : typeof value === 'number'
                  ? numbers.format(value)
                  : value;
        })
    );
}

export function t(key: MessageKey, values?: Values): string {
    return fill(messages[key] ?? fallback[key] ?? key, values);
}

export function tn(key: PluralKey, count: number, values?: Values): string {
    const form = `${key}.${plurals.select(count)}` as MessageKey;
    const other = `${key}.other` as MessageKey;

    return fill(messages[form] ?? messages[other] ?? fallback[other] ?? key, { ...values, count });
}

export function tk(key: string, otherwise: string, values?: Values): string {
    const text = (messages as Record<string, string>)[key];

    return text === undefined ? otherwise : fill(text, values);
}

export function isolated(value: unknown): boolean {
    return (
        direction === 'rtl' &&
        typeof value === 'string' &&
        /[A-Za-z]/.test(value) &&
        !value.startsWith(RLM)
    );
}

export function apiError(cause: unknown, otherwise: MessageKey): string {
    return cause instanceof ApiError ? tk(`errors.${cause.result}`, cause.result) : t(otherwise);
}
