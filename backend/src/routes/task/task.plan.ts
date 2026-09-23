import type { ChatMessage } from '../agent/agent.reply.js';

export const TASK_REPEATS = ['none', 'daily', 'weekly'] as const;

export type TaskRepeat = (typeof TASK_REPEATS)[number];

export const TASK_STATUSES = ['scheduled', 'running', 'done', 'failed', 'cancelled'] as const;

export const TITLE_MAX = 120;

export const DESCRIPTION_MAX = 4000;

export const GOAL_MAX = 2000;

const PERIOD: Record<TaskRepeat, number> = { none: 0, daily: 86_400_000, weekly: 604_800_000 };

export class TaskError extends Error {
    readonly code: string;

    constructor(code: string) {
        super(code);

        this.code = code;
    }
}

export interface TaskBody {
    title: string;
    description: string;
    goal: string;
    agent_id: number;
    profile_id: number;
    start_at: Date;
    repeat: TaskRepeat;
}

export function readTaskBody(body: unknown): TaskBody {
    const source = (typeof body === 'object' && body !== null ? body : {}) as Record<
        string,
        unknown
    >;
    const text = (key: string, max: number) =>
        typeof source[key] === 'string' ? (source[key] as string).trim().slice(0, max) : '';

    const title = text('title', TITLE_MAX);

    if (title === '') {
        throw new TaskError('TASK_TITLE_REQUIRED');
    }

    const agentId = Number(source['agent_id']);

    if (!Number.isInteger(agentId) || agentId < 1) {
        throw new TaskError('TASK_AGENT_REQUIRED');
    }

    const profileId = source['profile_id'] === undefined ? 0 : Number(source['profile_id']);

    if (!Number.isInteger(profileId) || profileId < 0) {
        throw new TaskError('TASK_PROFILE_INVALID');
    }

    const startAt = new Date(String(source['start_at'] ?? ''));

    if (Number.isNaN(startAt.getTime())) {
        throw new TaskError('TASK_START_INVALID');
    }

    const repeat = (source['repeat'] ?? 'none') as TaskRepeat;

    if (!TASK_REPEATS.includes(repeat)) {
        throw new TaskError('TASK_REPEAT_INVALID');
    }

    return {
        title,
        description: text('description', DESCRIPTION_MAX),
        goal: text('goal', GOAL_MAX),
        agent_id: agentId,
        profile_id: profileId,
        start_at: startAt,
        repeat,
    };
}

export function nextStart(startAt: Date, repeat: TaskRepeat, now: Date): Date | null {
    const period = PERIOD[repeat];

    if (period === 0) {
        return null;
    }

    if (startAt.getTime() > now.getTime()) {
        return startAt;
    }

    const behind = now.getTime() - startAt.getTime();
    const steps = Math.floor(behind / period) + 1;

    return new Date(startAt.getTime() + steps * period);
}

export function taskMessages(
    instructions: string,
    task: { title: string; description: string; goal: string },
    recipient: string,
    now: Date,
): ChatMessage[] {
    const brief = [
        '# Scheduled task',
        '',
        `You are carrying out a task you were given in advance, not answering a message. It is ${now.toISOString()}.`,
        recipient === ''
            ? 'Your reply is kept as the result of the task; nobody is sent it.'
            : `Your reply is sent to ${recipient} on Telegram as it is, so write it to them: the message itself, with no preamble about the task.`,
        'Use your tools where the task needs them. Do not invent facts you could not find.',
    ].join('\n');

    const request = [
        `Title: ${task.title}`,
        task.goal === '' ? '' : `Goal: ${task.goal}`,
        task.description === '' ? '' : `\n${task.description}`,
    ]
        .filter((line) => line !== '')
        .join('\n');

    return [
        {
            role: 'system',
            content: [instructions, brief].filter((part) => part.trim() !== '').join('\n\n---\n\n'),
        },
        { role: 'user', content: request },
    ];
}

export function profileLabel(person: {
    first_name: string;
    last_name: string;
    username: string;
    telegram_id: string;
}): string {
    const full = [person.first_name, person.last_name].filter((part) => part !== '').join(' ');

    if (full !== '') {
        return full;
    }

    return person.username !== '' ? `@${person.username}` : `Telegram ${person.telegram_id}`;
}
