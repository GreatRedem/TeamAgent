import { ApiError } from '@/apis/client';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALES } from '@/libs/constant';
import { DICTIONARIES, type MessageKey } from '@/locales';

type Values = Record<string, string | number>;

// A key that has `.one` and `.other` forms, for a message that changes with a count.
type PluralKey = MessageKey extends infer K
    ? K extends `${infer Base}.other`
        ? Base
        : never
    : never;

// The first of the reader's languages this app speaks, else English. A language chosen on this
// device (stored under LOCALE_STORAGE_KEY) comes before the browser's own list.
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

export const locale = detectLocale(
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]),
    storedLocale(),
);

export const direction = LOCALES.find((entry) => entry.code === locale)?.dir ?? 'ltr';

const messages = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
const fallback = DICTIONARIES[DEFAULT_LOCALE];
const plurals = new Intl.PluralRules(locale);
const numbers = new Intl.NumberFormat(locale);

function fill(text: string, values?: Values): string {
    if (values === undefined) {
        return text;
    }

    return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const value = values[name];

        return value === undefined
            ? whole
            : typeof value === 'number'
              ? numbers.format(value)
              : value;
    });
}

// A message in the reader's language, with {name} placeholders filled from `values`; numbers
// are written the reader's way.
export function t(key: MessageKey, values?: Values): string {
    return fill(messages[key] ?? fallback[key] ?? key, values);
}

// A message that changes with a count: `key.one` or `key.other`, whichever the language uses
// for that number, with {count} filled in.
export function tn(key: PluralKey, count: number, values?: Values): string {
    const form = `${key}.${plurals.select(count)}` as MessageKey;
    const other = `${key}.other` as MessageKey;

    return fill(messages[form] ?? messages[other] ?? fallback[other] ?? key, { ...values, count });
}

// A message whose key is only known at run time, such as one per capability the server lists.
// When there is none, `otherwise` is shown as it came.
export function tk(key: string, otherwise: string, values?: Values): string {
    const text = (messages as Record<string, string>)[key];

    return text === undefined ? otherwise : fill(text, values);
}

export function apiError(cause: unknown, otherwise: MessageKey): string {
    return cause instanceof ApiError ? tk(`errors.${cause.result}`, cause.result) : t(otherwise);
}
