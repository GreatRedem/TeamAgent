import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';
import { findOwnedTeam, readPage, readTeamId, takePage } from '../team/team.access.js';
import { AuditLog } from './audit.entity.js';
import { schemaAuditHeatmap, schemaAuditList } from './audit.schema.js';

const HEATMAP_DAYS = 84;

const LIST_LIMIT = 60;

function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function auditList(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const { limit, offset } = readPage(request, LIST_LIMIT);

        const [rows, total] = await fastify.db.getRepository(AuditLog).findAndCount({
            where: { team_id: teamId },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        reply.send({
            limit,
            offset,
            has_more,
            total,
            entries: items.map((entry) => ({
                id: entry.id,
                action: entry.action,
                target: entry.target,
                outcome: entry.outcome,
                detail: entry.detail,
                duration_ms: entry.duration_ms,
                actor: entry.actor,
                created_at: entry.created_at,
            })),
        });
    };

    return { schema: schemaAuditList, config: { ...authGuard() }, handler };
}

export function auditHeatmap(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const to = new Date();
        const from = new Date(to.getTime() - (HEATMAP_DAYS - 1) * 86400000);

        from.setUTCHours(0, 0, 0, 0);

        const rows = await fastify.db
            .getRepository(AuditLog)
            .createQueryBuilder('entry')
            .select("to_char(entry.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')", 'date')
            .addSelect('COUNT(*)', 'total')
            .addSelect("COUNT(*) FILTER (WHERE entry.outcome = 'error')", 'errors')
            .where('entry.team_id = :teamId', { teamId })
            .andWhere('entry.created_at >= :from', { from })
            .groupBy('date')
            .getRawMany<{ date: string; total: string; errors: string }>();

        const counts = new Map(
            rows.map((row) => [row.date, { total: Number(row.total), errors: Number(row.errors) }]),
        );

        const days: { date: string; total: number; errors: number }[] = [];

        for (let i = 0; i < HEATMAP_DAYS; i += 1) {
            const date = isoDate(new Date(from.getTime() + i * 86400000));
            const found = counts.get(date);

            days.push({ date, total: found?.total ?? 0, errors: found?.errors ?? 0 });
        }

        reply.send({
            days,
            from: isoDate(from),
            to: isoDate(to),
            total: days.reduce((sum, day) => sum + day.total, 0),
            busiest: days.reduce((most, day) => Math.max(most, day.total), 0),
        });
    };

    return { schema: schemaAuditHeatmap, config: { ...authGuard() }, handler };
}
