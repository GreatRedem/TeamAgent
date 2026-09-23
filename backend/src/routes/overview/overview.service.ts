import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';
import { TeamAgentExchange } from '../agent/agent.entity.js';
import { exchangeUsage } from '../agent/agent.usage.js';
import { findOwnedTeam, readTeamId } from '../team/team.access.js';
import { TeamModel } from '../team/team.entity.js';
import { TelegramMessage, TelegramUser } from '../telegram/telegram.entity.js';
import { schemaOverview } from './overview.schema.js';

const DAY = "now() - interval '1 day'";
const WEEK = "now() - interval '7 days'";

type Row = Record<string, string | null>;

const number = (row: Row | undefined, key: string) => Number(row?.[key] ?? 0);

const spent = (model: { prompt_tokens: number; completion_tokens: number }) =>
    model.prompt_tokens + model.completion_tokens;

export function overview(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const [people, messages, requests, models] = await Promise.all([
            fastify.db
                .getRepository(TelegramUser)
                .createQueryBuilder('u')
                .select('COUNT(*)', 'total')
                .addSelect(`COUNT(*) FILTER (WHERE u.created_at >= ${WEEK})`, 'new_week')
                .addSelect(`COUNT(*) FILTER (WHERE u.created_at >= ${DAY})`, 'new_today')
                .addSelect(`COUNT(*) FILTER (WHERE u.last_seen_at >= ${WEEK})`, 'active_week')
                .where('u.team_id = :teamId', { teamId })
                .getRawOne<Row>(),

            fastify.db
                .getRepository(TelegramMessage)
                .createQueryBuilder('m')
                .select(`COUNT(*) FILTER (WHERE m.sent_at >= ${DAY})`, 'today')
                .addSelect('COUNT(*)', 'week')
                .where('m.team_id = :teamId', { teamId })
                .andWhere("m.direction = 'in'")
                .andWhere(`m.sent_at >= ${WEEK}`)
                .getRawOne<Row>(),

            fastify.db
                .getRepository(TeamAgentExchange)
                .createQueryBuilder('x')
                .select(`COUNT(*) FILTER (WHERE x.created_at >= ${DAY})`, 'today')
                .addSelect(`COUNT(*) FILTER (WHERE x.created_at >= ${WEEK})`, 'week')
                .addSelect(
                    `COUNT(*) FILTER (WHERE x.created_at >= ${WEEK} AND x.outcome <> 'ok')`,
                    'failed_week',
                )
                .addSelect(
                    `COUNT(*) FILTER (WHERE x.created_at >= ${WEEK} AND x.outcome = 'ok' AND x.tool_calls = 0)`,
                    'replies_week',
                )
                .addSelect(
                    `COALESCE(SUM(x.prompt_tokens) FILTER (WHERE x.created_at >= ${WEEK}), 0)`,
                    'prompt_week',
                )
                .addSelect(
                    `COALESCE(SUM(x.completion_tokens) FILTER (WHERE x.created_at >= ${WEEK}), 0)`,
                    'completion_week',
                )
                .addSelect('COALESCE(SUM(x.prompt_tokens), 0)', 'prompt_total')
                .addSelect('COALESCE(SUM(x.completion_tokens), 0)', 'completion_total')
                .where('x.team_id = :teamId', { teamId })
                .getRawOne<Row>(),

            fastify.db
                .getRepository(TeamModel)
                .find({ where: { team_id: teamId }, select: { id: true, name: true } }),
        ]);

        const usage = await exchangeUsage(
            fastify,
            teamId,
            'model_id',
            models.map((model) => model.id),
        );

        reply.send({
            profiles: {
                total: number(people, 'total'),
                new_week: number(people, 'new_week'),
                active_week: number(people, 'active_week'),
            },
            chats: { today: number(people, 'new_today'), week: number(people, 'new_week') },
            messages: { today: number(messages, 'today'), week: number(messages, 'week') },
            requests: {
                today: number(requests, 'today'),
                week: number(requests, 'week'),
                failed_week: number(requests, 'failed_week'),
                replies_week: number(requests, 'replies_week'),
            },
            tokens: {
                prompt_week: number(requests, 'prompt_week'),
                completion_week: number(requests, 'completion_week'),
                prompt_total: number(requests, 'prompt_total'),
                completion_total: number(requests, 'completion_total'),
            },
            models: models
                .map((model) => {
                    const used = usage.get(model.id);

                    return {
                        id: model.id,
                        name: model.name,
                        replies: used?.replies ?? 0,
                        failures: used?.failures ?? 0,
                        prompt_tokens: used?.prompt_tokens ?? 0,
                        completion_tokens: used?.completion_tokens ?? 0,
                    };
                })
                .toSorted((a, b) => spent(b) - spent(a) || b.replies - a.replies),
        });
    };

    return { schema: schemaOverview, config: { ...authGuard() }, handler };
}
