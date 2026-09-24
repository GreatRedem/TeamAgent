import { type Paged, pageQuery, request } from './client';

export type TaskRepeat =
    | 'none'
    | 'every30m'
    | 'hourly'
    | 'every2h'
    | 'every5h'
    | 'every6h'
    | 'daily'
    | 'weekly';

export type TaskStatus = 'scheduled' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TeamTask {
    id: number;
    title: string;
    description: string;
    goal: string;
    agent_id: number;
    agent_name: string;
    profile_id: number;
    profile_name: string;
    group_bot_id: number;
    group_chat_id: string;
    group_title: string;
    start_at: string;
    repeat: TaskRepeat;
    status: TaskStatus;
    last_run_at: string | null;
    run_count: number;
    retry_count: number;
    retry_at: string | null;
    ok_count: number;
    error_count: number;
    last_outcome: string;
    created_at: string;
}

export interface TaskDraft {
    title: string;
    description: string;
    goal: string;
    agent_id: number;
    profile_id: number;
    group_bot_id: number;
    group_chat_id: string;
    start_at: string;
    repeat: TaskRepeat;
}

export type TaskRunEvent = { at: string } & (
    | { kind: 'start'; agent: string; model: string }
    | { kind: 'recipient'; name: string }
    | {
          kind: 'model';
          round: number;
          model: string;
          ok: boolean;
          reason: string;
          prompt_tokens: number;
          completion_tokens: number;
          estimated: boolean;
          tool_calls: number;
          duration_ms: number;
      }
    | {
          kind: 'tool';
          round: number;
          name: string;
          ok: boolean;
          args: string;
          result: string;
          duration_ms: number;
      }
    | { kind: 'send'; ok: boolean; to: string; bot: string }
    | { kind: 'end'; outcome: 'ok' | 'error'; delivered: boolean; reason: string }
    | { kind: 'retry'; attempt: number; of: number; next_at: string }
    | { kind: 'switch'; model: string }
);

export interface TaskRun {
    id: number;
    started_at: string;
    finished_at: string | null;
    outcome: 'running' | 'ok' | 'error';
    output: string;
    delivered: boolean;
    reason: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    tool_calls: number;
    log: TaskRunEvent[];
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
