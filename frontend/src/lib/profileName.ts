import type { TelegramProfile } from '@/api';

export function profileName(profile: TelegramProfile): string {
    const full = [profile.first_name, profile.last_name].filter((part) => part !== '').join(' ');

    if (full !== '') {
        return full;
    }

    return profile.username !== '' ? `@${profile.username}` : `Telegram ${profile.telegram_id}`;
}
