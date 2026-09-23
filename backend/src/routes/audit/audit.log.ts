import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { AUDIT_CHANGES_MAX, AUDIT_HIDDEN, DETAIL_MAX } from '../../constant.js';

import { AuditLog } from './audit.entity.js';

export type AuditOutcome = 'ok' | 'error' | 'skipped';

export type AuditActor = 'owner' | 'agent' | 'telegram' | 'system';

export interface AuditEntry {
    teamId?: number;
    accountId?: number;
    action: string;
    target?: string;
    outcome?: AuditOutcome;
    detail?: string;
    durationMs?: number;
    actor?: AuditActor;
    changes?: unknown;
}

export function changed(before: object, after: Record<string, unknown>) {
    const was = before as Record<string, unknown>;

    return Object.fromEntries(
        Object.keys(after)
            .filter((key) => JSON.stringify(was[key]) !== JSON.stringify(after[key]))
            .map((key) => [key, { from: was[key], to: after[key] }]),
    );
}

function hideSecrets(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(hideSecrets);
    }

    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, inner]) => [
                key,
                AUDIT_HIDDEN.has(key) && inner !== '' && inner !== undefined
                    ? '[hidden]'
                    : hideSecrets(inner),
            ]),
        );
    }

    return value;
}

export async function audit(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    entry: AuditEntry,
): Promise<void> {
    try {
        await fastify.db.getRepository(AuditLog).save({
            team_id: entry.teamId ?? 0,
            account_id: entry.accountId ?? 0,
            action: entry.action,
            target: entry.target ?? '',
            outcome: entry.outcome ?? 'ok',
            detail: (entry.detail ?? '').slice(0, DETAIL_MAX),
            changes:
                entry.changes === undefined
                    ? ''
                    : JSON.stringify(hideSecrets(entry.changes)).slice(0, AUDIT_CHANGES_MAX),
            duration_ms: Math.max(0, Math.round(entry.durationMs ?? 0)),
            actor: entry.actor ?? 'owner',
        });
    } catch (error) {
        log.error({ module: 'audit', action: entry.action, err: error }, 'audit write failed');
    }
}
