import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import { AuditLog } from './audit.entity.js';

export type AuditOutcome = 'ok' | 'error' | 'skipped';

export interface AuditEntry
{
    teamId?: number;
    accountId?: number;
    action: string;
    target?: string;
    outcome?: AuditOutcome;
    detail?: string;
}

const DETAIL_MAX = 512;

/**
 * Records one action.
 *
 * Never throws and never rejects: an audit write failing must not take down the
 * operation it was describing, which would turn a logging problem into an
 * outage. A failure is reported through the normal logger instead.
 *
 * Awaiting is optional. Handlers await so the entry is durable before the
 * response, while detached paths (the agent reply) fire and forget.
 */
export async function audit(fastify: FastifyInstance, log: FastifyBaseLogger, entry: AuditEntry): Promise<void>
{
    try
    {
        await fastify.db.getRepository(AuditLog).save({
            team_id: entry.teamId ?? 0,
            account_id: entry.accountId ?? 0,
            action: entry.action,
            target: entry.target ?? '',
            outcome: entry.outcome ?? 'ok',
            // Truncated rather than rejected: a long detail is not worth losing
            // the whole record over.
            detail: (entry.detail ?? '').slice(0, DETAIL_MAX)
        });
    }
    catch (error)
    {
        log.error({ module: 'audit', action: entry.action, err: error }, 'audit write failed');
    }
}
