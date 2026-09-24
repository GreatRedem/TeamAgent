import assert from 'node:assert/strict';

import type { FastifyInstance } from 'fastify';
import type { TeamTask } from '../routes/task/task.entity.js';
import { deliverTask } from '../routes/task/task.run.js';
import { TeamBot } from '../routes/team/team.entity.js';
import { TelegramMessage, type TelegramUser } from '../routes/telegram/telegram.entity.js';

async function main() {
    const TEAM = 1;
    const realFetch = globalThis.fetch;
    const bots = [
        { id: 5, team_id: TEAM, name: 'Front desk', token: '111:front' },
        { id: 6, team_id: TEAM, name: 'Imported', token: '' },
    ];
    const saved: Record<string, unknown>[] = [];
    let direct: Record<string, unknown> | null = null;

    const fastify = {
        db: {
            getRepository: (entity: unknown) =>
                entity === TeamBot
                    ? {
                          findOneBy: async (where: { id: number; team_id: number }) =>
                              bots.find(
                                  (bot) => bot.id === where.id && bot.team_id === where.team_id,
                              ) ?? null,
                      }
                    : entity === TelegramMessage
                      ? {
                            findOne: async (query: { where: Record<string, unknown> }) =>
                                direct !== null && query.where['chat_id'] === direct['chat_id']
                                    ? direct
                                    : null,
                            save: async (row: Record<string, unknown>) => {
                                saved.push(row);

                                return row;
                            },
                        }
                      : {},
        },
    } as unknown as FastifyInstance;

    const person = {
        id: 3,
        team_id: TEAM,
        telegram_id: '777',
        first_name: 'Sara',
        last_name: '',
        username: '',
    } as TelegramUser;
    const task = (group: Partial<TeamTask>) =>
        ({ id: 9, team_id: TEAM, group_bot_id: 0, group_chat_id: '', ...group }) as TeamTask;

    async function send(
        target: TeamTask,
        recipient: TelegramUser | null,
        statuses: Record<string, number>,
    ) {
        const chats: string[] = [];
        const notes: Record<string, unknown>[] = [];

        saved.length = 0;
        globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
            const chat = String(JSON.parse(String(init?.body))['chat_id']);
            const status = statuses[chat] ?? 200;

            chats.push(chat);

            return Response.json(
                status === 200
                    ? { ok: true, result: { message_id: 1 } }
                    : { ok: false, description: `refused ${status}` },
                { status },
            );
        }) as typeof fetch;

        try {
            const result = await deliverTask(
                fastify,
                target,
                recipient,
                'Team chat',
                'Hello',
                (event) => notes.push(event),
            );

            return { ...result, chats, notes };
        } finally {
            globalThis.fetch = realFetch;
        }
    }

    const tests: Array<[string, () => Promise<void>]> = [
        [
            'a task with only a group posts there and saves no conversation message',
            async () => {
                direct = null;

                const result = await send(
                    task({ group_bot_id: 5, group_chat_id: '-100123' }),
                    null,
                    {},
                );

                assert.deepEqual(result.chats, ['-100123']);
                assert.equal(result.delivered, 1);
                assert.deepEqual(result.failures, []);
                assert.equal(saved.length, 0);
                assert.equal(result.notes[0]?.['to'], 'Team chat');
            },
        ],
        [
            'a group and a person get it in both places, the person by direct message',
            async () => {
                direct = { bot_id: 5, chat_id: '777' };

                const result = await send(
                    task({ group_bot_id: 5, group_chat_id: '-100123' }),
                    person,
                    {},
                );

                assert.deepEqual(result.chats, ['-100123', '777']);
                assert.equal(result.delivered, 2);
                assert.equal(saved.length, 1);
                assert.equal(saved[0]?.['user_id'], 3);
            },
        ],
        [
            'a person alone still only gets it privately',
            async () => {
                direct = null;

                const result = await send(task({}), person, {});

                assert.deepEqual(result.chats, []);
                assert.equal(result.delivered, 0);
                assert.match(result.failures[0] ?? '', /direct message/);
            },
        ],
        [
            'a group whose bot is gone or has no token fails without sending',
            async () => {
                direct = null;

                const gone = await send(task({ group_bot_id: 99, group_chat_id: '-1' }), null, {});
                const tokenless = await send(
                    task({ group_bot_id: 6, group_chat_id: '-1' }),
                    null,
                    {},
                );

                assert.deepEqual(gone.chats, []);
                assert.match(gone.failures[0] ?? '', /no longer connected/);
                assert.deepEqual(tokenless.chats, []);
                assert.equal(tokenless.delivered, 0);
            },
        ],
        [
            'when one place took it, a failure elsewhere is not retried, so nobody gets it twice',
            async () => {
                direct = { bot_id: 5, chat_id: '777' };

                const result = await send(
                    task({ group_bot_id: 5, group_chat_id: '-100123' }),
                    person,
                    { '-100123': 502 },
                );

                assert.equal(result.delivered, 1);
                assert.match(result.failures[0] ?? '', /Team chat \(502\)/);
                assert.equal(result.retryable, false);

                const alone = await send(
                    task({ group_bot_id: 5, group_chat_id: '-100123' }),
                    null,
                    {
                        '-100123': 502,
                    },
                );

                assert.equal(alone.retryable, true, 'nothing went out, so a retry is safe');
            },
        ],
    ];

    let failed = 0;

    for (const [title, test] of tests) {
        try {
            await test();

            console.log(`  ok    ${title}`);
        } catch (error) {
            failed += 1;

            console.log(`  FAIL  ${title}`);
            console.log(`        ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    console.log(
        failed === 0 ? `\n${tests.length} passed` : `\n${failed} of ${tests.length} failed`,
    );

    process.exit(failed === 0 ? 0 : 1);
}

await main();
