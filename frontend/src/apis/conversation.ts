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

export function conversationList(teamId: number, page?: Partial<Paged>) {
    return request<{ conversations: TelegramProfile[] } & Paged>(
        'GET',
        `/team/${teamId}/conversation${pageQuery(page)}`,
    );
}

export function conversationMessages(teamId: number, profileId: number, page?: Partial<Paged>) {
    return request<{ profile: TelegramProfile; messages: TelegramMessage[] } & Paged>(
        'GET',
        `/team/${teamId}/conversation/${profileId}${pageQuery(page)}`,
    );
}
