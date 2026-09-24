import { BYTE_UNITS, TOKENS_PER_CHARACTER } from '@/libs/constant';
import { region, t } from '@/libs/i18n';

export function numberLabel(value: number): string {
    return value.toLocaleString(region);
}

export function dateLabel(value: string | Date): string {
    return new Date(value).toLocaleDateString(region);
}

export function dateTimeLabel(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
    return new Date(value).toLocaleString(region, options);
}

export function timeLabel(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
    return new Date(value).toLocaleTimeString(region, options);
}

export function weekdayLabel(day: number): string {
    return new Intl.DateTimeFormat(region, { weekday: 'short', timeZone: 'UTC' }).format(
        Date.UTC(2023, 0, 1 + day),
    );
}

export function tokenLabel(text: string): string {
    return t('common.tokens', { count: Math.ceil(text.length / TOKENS_PER_CHARACTER) });
}

export function byteLabel(bytes: number): string {
    if (bytes <= 0) {
        return `${numberLabel(0)} B`;
    }

    const step = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / 1024 ** step;

    return `${value.toLocaleString(region, { maximumFractionDigits: value < 10 && step > 0 ? 1 : 0 })} ${BYTE_UNITS[step]}`;
}

export function uptimeLabel(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return t('common.uptime.days', { days, hours });
    }

    return hours > 0
        ? t('common.uptime.hours', { hours, minutes })
        : t('common.uptime.minutes', { minutes });
}

export function compactCount(value: number): string {
    return new Intl.NumberFormat(region, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

export function durationLabel(ms: number): string {
    return ms < 1000
        ? t('common.milliseconds', { count: ms })
        : t('common.seconds', { count: Math.round(ms / 100) / 10 });
}

export function localInputValue(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function prettyJson(text: string): string {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}
