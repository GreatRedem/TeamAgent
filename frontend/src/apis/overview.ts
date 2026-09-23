import { request } from './client';

export interface ProjectOverview {
    profiles: { total: number; new_week: number; active_week: number };
    chats: { today: number; week: number };
    messages: { today: number; week: number };
    requests: { today: number; week: number; failed_week: number; replies_week: number };
    tokens: {
        prompt_week: number;
        completion_week: number;
        prompt_total: number;
        completion_total: number;
    };
    models: {
        id: number;
        name: string;
        replies: number;
        failures: number;
        prompt_tokens: number;
        completion_tokens: number;
    }[];
}

export function projectOverview(teamId: number) {
    return request<ProjectOverview>('GET', `/team/${teamId}/overview`);
}
