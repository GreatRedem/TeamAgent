import type { FastifyInstance } from 'fastify';

import { TeamAgentExchange } from './agent.entity.js';

// What a model or an agent has done over every round-trip on record. A reply is a round that
// succeeded without asking for tools, so a tool round and its answer count as one reply; a
// round-trip is every call, tool rounds and failures included.
export interface ExchangeUsage {
    replies: number;
    round_trips: number;
    failures: number;
    prompt_tokens: number;
    completion_tokens: number;
    tool_calls: number;
    average_ms: number;
    last_used_at: string | null;
}

export const NO_USAGE: ExchangeUsage = {
    replies: 0,
    round_trips: 0,
    failures: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    tool_calls: 0,
    average_ms: 0,
    last_used_at: null,
};

export const schemaUsage = {
    type: 'object',
    required: [
        'replies',
        'round_trips',
        'failures',
        'prompt_tokens',
        'completion_tokens',
        'tool_calls',
        'average_ms',
        'last_used_at',
    ],
    properties: {
        replies: { type: 'integer' },
        round_trips: { type: 'integer' },
        failures: { type: 'integer' },
        prompt_tokens: { type: 'integer' },
        completion_tokens: { type: 'integer' },
        tool_calls: { type: 'integer' },
        average_ms: { type: 'integer' },
        last_used_at: { type: ['string', 'null'] },
    },
} as const;

// Totals per model or per agent, in one grouped query. Ids with no round-trips are absent.
export async function exchangeUsage(
    fastify: FastifyInstance,
    teamId: number,
    by: 'model_id' | 'agent_id',
    ids: number[],
): Promise<Map<number, ExchangeUsage>> {
    if (ids.length === 0) {
        return new Map();
    }

    const rows = await fastify.db
        .getRepository(TeamAgentExchange)
        .createQueryBuilder('x')
        .select(`x.${by}`, 'id')
        .addSelect('COUNT(*)', 'round_trips')
        .addSelect("COUNT(*) FILTER (WHERE x.outcome = 'ok' AND x.tool_calls = 0)", 'replies')
        .addSelect("COUNT(*) FILTER (WHERE x.outcome <> 'ok')", 'failures')
        .addSelect('COALESCE(SUM(x.prompt_tokens), 0)', 'prompt_tokens')
        .addSelect('COALESCE(SUM(x.completion_tokens), 0)', 'completion_tokens')
        .addSelect('COALESCE(SUM(x.tool_calls), 0)', 'tool_calls')
        .addSelect(
            "COALESCE(ROUND(AVG(x.duration_ms) FILTER (WHERE x.outcome = 'ok')), 0)",
            'average_ms',
        )
        .addSelect('MAX(x.created_at)', 'last_used_at')
        .where('x.team_id = :teamId', { teamId })
        .andWhere(`x.${by} IN (:...ids)`, { ids })
        .groupBy(`x.${by}`)
        .getRawMany<Record<string, string | Date | null>>();

    return new Map(
        rows.map((row) => [
            Number(row['id']),
            {
                replies: Number(row['replies']),
                round_trips: Number(row['round_trips']),
                failures: Number(row['failures']),
                prompt_tokens: Number(row['prompt_tokens']),
                completion_tokens: Number(row['completion_tokens']),
                tool_calls: Number(row['tool_calls']),
                average_ms: Number(row['average_ms']),
                last_used_at:
                    row['last_used_at'] === null
                        ? null
                        : new Date(row['last_used_at'] as string | Date).toISOString(),
            },
        ]),
    );
}
