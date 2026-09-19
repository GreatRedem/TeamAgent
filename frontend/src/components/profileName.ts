import type { TelegramProfile } from '../lib/api';

/**
 * A profile's display name, falling back through what Telegram supplied.
 *
 * Shared between the profile list and the profile page so one person is never
 * labelled two different ways.
 */
export function profileName(profile: TelegramProfile): string
{
    const full = [ profile.first_name, profile.last_name ].filter((part) => part !== '').join(' ');

    if (full !== '')
    {
        return full;
    }

    return profile.username !== '' ? `@${ profile.username }` : `Telegram ${ profile.telegram_id }`;
}
