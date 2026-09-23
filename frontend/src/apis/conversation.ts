import { type Paged, pageQuery, request } from './client';

export interface TelegramProfile {
    id: number;
    telegram_id: string;
    username: string;
    first_name: string;
    last_name: string;
    language_code: string;
    message_count: number;
    permissions: string[];
    last_seen_at: string;
    created_at: string;
}

export interface TelegramMessage {
    id: number;
    bot_id: number;
    text: string;
    direction: 'in' | 'out';
    sent_at: string;
}

// `query` narrows the list to names and usernames containing it.
export function conversationList(teamId: number, page?: Partial<Paged>, query = '') {
    const search = query.trim() === '' ? '' : `q=${encodeURIComponent(query.trim())}`;
    const paging = pageQuery(page);

    return request<{ conversations: TelegramProfile[] } & Paged>(
        'GET',
        `/team/${teamId}/conversation${paging}${search === '' ? '' : `${paging === '' ? '?' : '&'}${search}`}`,
    );
}

export function conversationMessages(teamId: number, profileId: number, page?: Partial<Paged>) {
    return request<{ profile: TelegramProfile; messages: TelegramMessage[] } & Paged>(
        'GET',
        `/team/${teamId}/conversation/${profileId}${pageQuery(page)}`,
    );
}
