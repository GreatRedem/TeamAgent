import assert from 'node:assert/strict';

import type { FastifyInstance } from 'fastify';
import type { TeamAgent } from '../routes/agent/agent.entity.js';
import { runTool } from '../routes/mcp/mcp.tools.js';
import { TeamDocument } from '../routes/team/team.entity.js';
import { TelegramUser } from '../routes/telegram/telegram.entity.js';

async function main() {
    const TEAM = 1;
    const roster = JSON.stringify({
        members: [
            { name: 'Sara', roles: ['Community manager'], profile_id: 11 },
            { name: 'Sam', profile_id: 12 },
            { name: 'Old', rank: 'Founder', profile_id: 13 },
        ],
    });
    const person = (id: number, team_id: number, first_name: string, permissions: string) => ({
        id,
        team_id,
        first_name,
        last_name: '',
        username: '',
        telegram_id: String(id),
        permissions,
    });
    const people = [
        person(0, TEAM, '', ''),
        person(11, TEAM, 'Sara', 'chat,model,delegate'),
        person(12, TEAM, 'Sam', 'chat'),
        person(13, TEAM, 'Old', 'chat'),
        person(20, TEAM, 'Kim', 'chat,delegate'),
        person(21, TEAM, 'Stranger', 'chat'),
        person(30, 2, 'Elsewhere', 'chat'),
    ];
    const audited: Record<string, unknown>[] = [];

    const fastify = {
        log: { error() {} },
        db: {
            getRepository: (entity: unknown) => {
                if (entity === TeamDocument) {
                    return { findOneBy: async () => ({ content: roster }) };
                }

                if (entity === TelegramUser) {
                    return {
                        findOneBy: async (where: { id: number; team_id: number }) =>
                            people.find(
                                (row) => row.id === where.id && row.team_id === where.team_id,
                            ) ?? null,
                        update: async (where: { id: number }, patch: { permissions: string }) => {
                            const row = people.find((item) => item.id === where.id);

                            if (row) {
                                row.permissions = patch.permissions;
                            }
                        },
                    };
                }

                return {
                    save: async (row: Record<string, unknown>) => {
                        audited.push(row);

                        return row;
                    },
                };
            },
        },
    } as unknown as FastifyInstance;

    const agent = {
        id: 5,
        team_id: TEAM,
        name: 'Team agent',
        permissions: 'team.read,team.chat',
    } as TeamAgent;

    const ask = (askerId: number, args: Record<string, unknown>, by = agent) =>
        runTool(
            fastify,
            by,
            people.find((row) => row.id === askerId) as unknown as TelegramUser,
            'team_member_chat',
            args,
        );
    const permissionsOf = (id: number) => people.find((row) => row.id === id)?.permissions;

    const tests: Array<[string, () => Promise<void>]> = [
        [
            'someone on team.json with a role turns chat with the model on, and nothing else moves',
            async () => {
                const result = await ask(11, { member_id: 20, enabled: true });

                assert.equal(result.ok, true, result.content);
                assert.equal(permissionsOf(20), 'chat,model,delegate');
                assert.equal(audited.at(-1)?.['action'], 'profile.permissions');
                assert.equal(audited.at(-1)?.['actor'], 'agent');
                assert.match(String(audited.at(-1)?.['changes']), /"asked_by":11/);
            },
        ],
        [
            'and off again, keeping chat and delegate',
            async () => {
                assert.equal((await ask(11, { member_id: 20, enabled: false })).ok, true);
                assert.equal(permissionsOf(20), 'chat,delegate');
            },
        ],
        [
            'an old single rank counts as a role',
            async () => {
                assert.equal((await ask(13, { member_id: 21, enabled: true })).ok, true);
                assert.equal(permissionsOf(21), 'chat,model');
            },
        ],
        [
            'on team.json without a role is refused',
            async () => {
                const result = await ask(12, { member_id: 12, enabled: true });

                assert.equal(result.ok, false);
                assert.equal(permissionsOf(12), 'chat');
            },
        ],
        [
            'someone not on team.json is refused, even about themselves',
            async () => {
                assert.equal((await ask(20, { member_id: 20, enabled: true })).ok, false);
                assert.equal(permissionsOf(20), 'chat,delegate');
            },
        ],
        [
            'nobody asking, as in a plugin reply, is refused',
            async () => {
                assert.equal((await ask(0, { member_id: 20, enabled: true })).ok, false);
            },
        ],
        [
            'a profile of another project is out of reach',
            async () => {
                assert.equal((await ask(11, { member_id: 30, enabled: true })).ok, false);
                assert.equal(permissionsOf(30), 'chat');
            },
        ],
        [
            'an agent without team.chat cannot use it',
            async () => {
                const plain = { ...agent, permissions: 'team.read' } as TeamAgent;

                assert.equal((await ask(11, { member_id: 20, enabled: true }, plain)).ok, false);
                assert.equal(permissionsOf(20), 'chat,delegate');
            },
        ],
        [
            'enabled must be a yes or no',
            async () => {
                assert.equal((await ask(11, { member_id: 20, enabled: 'yes' })).ok, false);
            },
        ],
    ];

    let failed = 0;

    for (const [title, run] of tests) {
        try {
            await run();

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
