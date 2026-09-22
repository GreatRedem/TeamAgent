import { BYTE_UNITS, TOKENS_PER_CHARACTER } from '@/lib/constant';

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
