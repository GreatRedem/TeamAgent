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

// A count as it reads at a glance: 950, 12K, 3.4M.
export function compactCount(value: number): string {
    return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

// A duration in the unit that reads best: 850 ms, 2.4 s.
export function durationLabel(ms: number): string {
    return ms < 1000 ? `${ms.toLocaleString()} ms` : `${(ms / 1000).toFixed(1)} s`;
}
