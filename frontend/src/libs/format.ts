import { BYTE_UNITS, TOKENS_PER_CHARACTER } from '@/libs/constant';

export function tokenLabel(text: string): string {
    return `~${Math.ceil(text.length / TOKENS_PER_CHARACTER).toLocaleString()} tokens`;
}

export function byteLabel(bytes: number): string {
    if (bytes <= 0) {
        return '0 B';
    }

    const step = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / 1024 ** step;

    return `${value.toFixed(value < 10 && step > 0 ? 1 : 0)} ${BYTE_UNITS[step]}`;
}

export function uptimeLabel(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h`;
    }

    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function compactCount(value: number): string {
    return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

export function durationLabel(ms: number): string {
    return ms < 1000 ? `${ms.toLocaleString()} ms` : `${(ms / 1000).toFixed(1)} s`;
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
