import { pageQuery, request, type Paged } from './client';
import type { TelegramMessage, TelegramProfile } from './conversation';

export interface TelegramProfileBot
{
    id: number;
    name: string;
    message_count: number;
    last_seen_at: string;
}

export interface ProfileFile
{
    id: number;
    name: string;
    content: string;
    updated_at: string;
}

export function profileDetails(teamId: number, profileId: number)
{
    return request<{ profile: TelegramProfile; bots: TelegramProfileBot[]; messages: TelegramMessage[] }>('GET', `/team/${ teamId }/profile/${ profileId }`);
}

export function profileFiles(teamId: number, profileId: number, page?: Partial<Paged>)
{
    return request<{ files: ProfileFile[] } & Paged>('GET', `/team/${ teamId }/profile/${ profileId }/file${ pageQuery(page) }`);
}
