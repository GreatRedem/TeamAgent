import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import { AuditLog } from './audit.entity.js';

export type AuditOutcome = 'ok' | 'error' | 'skipped';

export type AuditActor = 'owner' | 'agent' | 'telegram' | 'system';

export interface AuditEntry
{
    teamId?: number;
    accountId?: number;
    action: string;
    target?: string;
    outcome?: AuditOutcome;
    detail?: string;
    durationMs?: number;
    actor?: AuditActor;
}

const DETAIL_MAX = 512;

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
            detail: (entry.detail ?? '').slice(0, DETAIL_MAX),
            duration_ms: Math.max(0, Math.round(entry.durationMs ?? 0)),
            actor: entry.actor ?? 'owner'
        });
    }
    catch (error)
    {
        log.error({ module: 'audit', action: entry.action, err: error }, 'audit write failed');
    }
}
