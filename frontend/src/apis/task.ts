import { type Paged, pageQuery, request } from './client';

export type TaskRepeat = 'none' | 'daily' | 'weekly';

export type TaskStatus = 'scheduled' | 'running' | 'done' | 'failed' | 'cancelled';

// Work an agent carries out at a set time. `profile_id` 0 keeps the result on the page; any
// other is the person it is sent to on Telegram. `start_at` is when it next runs.
export interface TeamTask {
    id: number;
    title: string;
    description: string;
    goal: string;
    agent_id: number;
    agent_name: string;
    profile_id: number;
    profile_name: string;
    start_at: string;
    repeat: TaskRepeat;
    status: TaskStatus;
    last_run_at: string | null;
    run_count: number;
    // How the latest run ended: ok, error, running, or empty before the first.
    last_outcome: string;
    created_at: string;
}

export interface TaskDraft {
    title: string;
    description: string;
    goal: string;
    agent_id: number;
    profile_id: number;
    start_at: string;
    repeat: TaskRepeat;
}

// One time a task ran: what the agent produced, and whether it reached its person.
export interface TaskRun {
    id: number;
    started_at: string;
    finished_at: string | null;
    outcome: 'running' | 'ok' | 'error';
    output: string;
    delivered: boolean;
    reason: string;
}

export function taskList(teamId: number, page?: Partial<Paged>) {
    return request<{ tasks: TeamTask[] } & Paged>('GET', `/team/${teamId}/task${pageQuery(page)}`);
}

export function taskCreate(teamId: number, draft: TaskDraft) {
    return request<TeamTask>('POST', `/team/${teamId}/task`, draft);
}

export function taskUpdate(teamId: number, taskId: number, draft: TaskDraft) {
    return request<TeamTask>('PATCH', `/team/${teamId}/task/${taskId}`, draft);
}

export function taskStatus(teamId: number, taskId: number, status: 'scheduled' | 'cancelled') {
    return request<TeamTask>('POST', `/team/${teamId}/task/${taskId}/status`, { status });
}

export function taskRemove(teamId: number, taskId: number) {
    return request<{ result: string }>('DELETE', `/team/${teamId}/task/${taskId}`);
}

export function taskRunNow(teamId: number, taskId: number) {
    return request<{ result: string }>('POST', `/team/${teamId}/task/${taskId}/run`);
}

export function taskRuns(teamId: number, taskId: number, page?: Partial<Paged>) {
    return request<{ runs: TaskRun[] } & Paged>(
        'GET',
        `/team/${teamId}/task/${taskId}/run${pageQuery(page)}`,
    );
}
