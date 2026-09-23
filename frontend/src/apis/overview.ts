import { request } from './client';

// A project at a glance. `today` is the last 24 hours and `week` the last seven days. A chat is
// new when its person wrote for the first time; a request is one round-trip to a model; a reply
// is a round-trip that answered.
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
    // Busiest first, by tokens, over all time.
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
