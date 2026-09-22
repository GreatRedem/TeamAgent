import { type Paged, pageQuery, request } from './client';
import type { TelegramMessage, TelegramProfile } from './conversation';

export interface TelegramProfileBot {
    id: number;
    name: string;
    message_count: number;
    last_seen_at: string;
}

// A file one agent keeps on a person. Each agent keeps its own; `agent_id` 0 is a file from
// before that, and an empty `agent_name` with a real id is an agent since removed.
export interface ProfileFile {
    id: number;
    agent_id: number;
    agent_name: string;
    name: string;
    content: string;
    updated_at: string;
}

export function profileDetails(teamId: number, profileId: number) {
    return request<{
        profile: TelegramProfile;
        bots: TelegramProfileBot[];
        messages: TelegramMessage[];
    }>('GET', `/team/${teamId}/profile/${profileId}`);
}

export function profileFiles(teamId: number, profileId: number, page?: Partial<Paged>) {
    return request<{ files: ProfileFile[] } & Paged>(
        'GET',
        `/team/${teamId}/profile/${profileId}/file${pageQuery(page)}`,
    );
}
