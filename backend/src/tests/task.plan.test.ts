import assert from 'node:assert/strict';

import {
    nextStart,
    profileLabel,
    readTaskBody,
    retryAt,
    sendRetryable,
    TaskError,
    taskMessages,
} from '../routes/task/task.plan.js';

function main() {
    const code = (run: () => unknown) => {
        try {
            run();
        } catch (cause) {
            return cause instanceof TaskError ? cause.code : 'other';
        }

        return 'none';
    };

    {
        const body = readTaskBody({
            title: '  Weather for Alex ',
            agent_id: 3,
            start_at: '2026-09-24T06:30:00.000Z',
        });

        assert.equal(body.title, 'Weather for Alex');
        assert.equal(body.profile_id, 0, 'nobody to send to unless chosen');
        assert.equal(body.repeat, 'none');
        assert.equal(body.start_at.toISOString(), '2026-09-24T06:30:00.000Z');

        assert.equal(
            code(() => readTaskBody({ agent_id: 3, start_at: '2026-09-24' })),
            'TASK_TITLE_REQUIRED',
        );
        assert.equal(
            code(() => readTaskBody({ title: 'x', start_at: '2026-09-24' })),
            'TASK_AGENT_REQUIRED',
        );
        assert.equal(
            code(() => readTaskBody({ title: 'x', agent_id: 1, start_at: 'soon' })),
            'TASK_START_INVALID',
        );
        assert.equal(
            code(() =>
                readTaskBody({
                    title: 'x',
                    agent_id: 1,
                    start_at: '2026-09-24',
                    repeat: 'monthly',
                }),
            ),
            'TASK_REPEAT_INVALID',
        );
        assert.equal(
            readTaskBody({ title: 'x', agent_id: 1, start_at: '2026-09-24', repeat: 'hourly' })
                .repeat,
            'hourly',
        );
        assert.equal(
            code(() =>
                readTaskBody({ title: 'x', agent_id: 1, start_at: '2026-09-24', profile_id: -2 }),
            ),
            'TASK_PROFILE_INVALID',
        );

        const grouped = readTaskBody({
            title: 'x',
            agent_id: 1,
            start_at: '2026-09-24',
            group_bot_id: 2,
            group_chat_id: '-100123',
        });

        assert.equal(grouped.group_bot_id, 2);
        assert.equal(grouped.group_chat_id, '-100123');
        assert.equal(
            readTaskBody({ title: 'x', agent_id: 1, start_at: '2026-09-24' }).group_chat_id,
            '',
        );

        for (const group of [
            { group_bot_id: 2 },
            { group_chat_id: '-100123' },
            { group_bot_id: 2, group_chat_id: '555' },
            { group_bot_id: -1, group_chat_id: '-1' },
        ]) {
            assert.equal(
                code(() =>
                    readTaskBody({ title: 'x', agent_id: 1, start_at: '2026-09-24', ...group }),
                ),
                'TASK_GROUP_INVALID',
                JSON.stringify(group),
            );
        }
    }

    {
        const nine = new Date('2026-09-23T09:00:00.000Z');
        const day = 86_400_000;

        assert.equal(nextStart(nine, 'none', new Date(nine.getTime() + 1)), null, 'a one-off ends');
        assert.equal(
            nextStart(nine, 'daily', new Date(nine.getTime() + 60_000))?.toISOString(),
            '2026-09-24T09:00:00.000Z',
            'the same time the next day',
        );
        assert.equal(
            nextStart(nine, 'daily', new Date(nine.getTime() + 3 * day + 5))?.toISOString(),
            '2026-09-27T09:00:00.000Z',
            'days missed while down are skipped, not all run',
        );
        assert.equal(
            nextStart(nine, 'weekly', new Date(nine.getTime() + 60_000))?.toISOString(),
            '2026-09-30T09:00:00.000Z',
        );
        assert.equal(
            nextStart(nine, 'daily', new Date(nine.getTime() - 3_600_000))?.toISOString(),
            nine.toISOString(),
            'run early by hand, the slot still ahead is kept',
        );
    }

    {
        const now = new Date('2026-09-23T09:00:00.000Z');
        const [system, request] = taskMessages(
            'You are Nura.',
            {
                title: 'Morning weather',
                goal: 'Alex knows whether to take a coat',
                description: 'Tehran',
            },
            'Alex',
            now,
        );

        assert.equal(system.role, 'system');
        assert.ok(system.content.startsWith('You are Nura.'), 'its own instructions come first');
        assert.ok(system.content.includes('sent to Alex'));
        assert.ok(system.content.includes(now.toISOString()));
        assert.equal(request.role, 'user');
        assert.ok(request.content.includes('Title: Morning weather'));
        assert.ok(request.content.includes('Goal: Alex knows'));
        assert.ok(request.content.includes('Tehran'));

        const [kept] = taskMessages('', { title: 'Search', goal: '', description: '' }, '', now);

        assert.ok(kept.content.includes('nobody is sent it'));

        const [posted] = taskMessages(
            '',
            { title: 'News', goal: '', description: '' },
            'Sara',
            now,
            [],
            'Team chat',
        );

        assert.ok(posted.content.includes('Telegram group "Team chat"'));
        assert.ok(posted.content.includes('never include anything private about Sara'));
        assert.ok(!posted.content.includes('nobody is sent it'));
        assert.ok(!kept.content.startsWith('\n'), 'no empty instructions section');
        assert.ok(!kept.content.includes('This task repeats'), 'a one-off is not told it repeats');

        const [hourly] = taskMessages(
            '',
            { title: 'Blockchain news', goal: '', description: '', repeat: 'hourly' },
            '',
            now,
            [
                { at: '2026-09-23T08:00:00.000Z', output: 'Posted:\n  ETF inflows hit a record' },
                { at: '2026-09-23T07:00:00.000Z', output: 'x'.repeat(2000) },
            ],
        );

        assert.ok(hourly.content.includes('This task repeats'));
        assert.ok(
            hourly.content.includes('- 2026-09-23T08:00:00.000Z: Posted: ETF inflows hit a record'),
        );
        assert.ok(
            hourly.content.includes(`- 2026-09-23T07:00:00.000Z: ${'x'.repeat(600)}\n`) === false,
        );
        assert.ok(hourly.content.endsWith(`- 2026-09-23T07:00:00.000Z: ${'x'.repeat(600)}`));
    }

    assert.equal(
        nextStart(
            new Date('2026-09-23T09:00:00.000Z'),
            'hourly',
            new Date('2026-09-23T11:30:00.000Z'),
        )?.toISOString(),
        '2026-09-23T12:00:00.000Z',
        'hourly skips the hours it missed',
    );

    assert.equal(
        profileLabel({ first_name: 'Alex', last_name: 'K', username: 'alexk', telegram_id: '1' }),
        'Alex K',
    );
    assert.equal(
        profileLabel({ first_name: '', last_name: '', username: 'alexk', telegram_id: '1' }),
        '@alexk',
    );

    {
        const now = new Date('2026-09-23T09:00:00.000Z');

        assert.equal(retryAt(0, now)?.toISOString(), '2026-09-23T09:01:00.000Z');
        assert.equal(retryAt(1, now)?.toISOString(), '2026-09-23T09:05:00.000Z');
        assert.equal(retryAt(2, now)?.toISOString(), '2026-09-23T09:15:00.000Z');
        assert.equal(retryAt(3, now), null);

        assert.equal(sendRetryable(0), true);
        assert.equal(sendRetryable(429), true);
        assert.equal(sendRetryable(502), true);
        assert.equal(sendRetryable(403), false);
        assert.equal(sendRetryable(400), false);
    }

    console.log('task.plan: ok');
}

main();
