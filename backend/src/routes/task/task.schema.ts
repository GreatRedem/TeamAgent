function task() {
    return {
        type: 'object',
        required: [
            'id',
            'title',
            'description',
            'goal',
            'agent_id',
            'agent_name',
            'profile_id',
            'profile_name',
            'start_at',
            'repeat',
            'status',
            'last_run_at',
            'run_count',
            'ok_count',
            'error_count',
            'last_outcome',
            'created_at',
        ],
        properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            goal: { type: 'string' },
            agent_id: { type: 'integer' },
            agent_name: { type: 'string' },
            profile_id: { type: 'integer' },
            profile_name: { type: 'string' },
            start_at: { type: 'string' },
            repeat: { type: 'string' },
            status: { type: 'string' },
            last_run_at: { type: ['string', 'null'] },
            run_count: { type: 'integer' },
            ok_count: { type: 'integer' },
            error_count: { type: 'integer' },
            last_outcome: { type: 'string' },
            created_at: { type: 'string' },
        },
    } as const;
}

function body() {
    return {
        type: 'object',
        required: ['title', 'agent_id', 'start_at'],
        properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            goal: { type: 'string' },
            agent_id: { type: 'integer' },
            profile_id: { type: 'integer' },
            start_at: { type: 'string' },
            repeat: { type: 'string' },
        },
    } as const;
}

function paged(key: string, items: object) {
    return {
        200: {
            type: 'object',
            required: [key, 'limit', 'offset', 'has_more', 'total'],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                [key]: { type: 'array', items },
            },
        },
    } as const;
}

export function schemaTaskList() {
    return { response: paged('tasks', task()) } as const;
}

export function schemaTaskSave() {
    return { body: body(), response: { 200: task() } } as const;
}

export function schemaTaskStatus() {
    return {
        body: {
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string', enum: ['scheduled', 'cancelled'] } },
        },
        response: { 200: task() },
    } as const;
}

export function schemaTaskResult() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['result'],
                properties: { result: { type: 'string' } },
            },
        },
    } as const;
}

export function schemaTaskRuns() {
    return {
        response: paged('runs', {
            type: 'object',
            required: [
                'id',
                'started_at',
                'finished_at',
                'outcome',
                'output',
                'delivered',
                'reason',
                'model',
                'prompt_tokens',
                'completion_tokens',
                'tool_calls',
                'log',
            ],
            properties: {
                id: { type: 'integer' },
                started_at: { type: 'string' },
                finished_at: { type: ['string', 'null'] },
                outcome: { type: 'string' },
                output: { type: 'string' },
                delivered: { type: 'boolean' },
                reason: { type: 'string' },
                model: { type: 'string' },
                prompt_tokens: { type: 'integer' },
                completion_tokens: { type: 'integer' },
                tool_calls: { type: 'integer' },
                log: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
        }),
    } as const;
}
