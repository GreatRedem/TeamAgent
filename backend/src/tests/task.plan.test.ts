import assert from 'node:assert/strict';

import {
    nextStart,
    profileLabel,
    readTaskBody,
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
                readTaskBody({ title: 'x', agent_id: 1, start_at: '2026-09-24', repeat: 'hourly' }),
            ),
            'TASK_REPEAT_INVALID',
        );
        assert.equal(
            code(() =>
                readTaskBody({ title: 'x', agent_id: 1, start_at: '2026-09-24', profile_id: -2 }),
            ),
            'TASK_PROFILE_INVALID',
        );
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
        assert.ok(!kept.content.startsWith('\n'), 'no empty instructions section');
    }

    assert.equal(
        profileLabel({ first_name: 'Alex', last_name: 'K', username: 'alexk', telegram_id: '1' }),
        'Alex K',
    );
    assert.equal(
        profileLabel({ first_name: '', last_name: '', username: 'alexk', telegram_id: '1' }),
        '@alexk',
    );

    console.log('task.plan: ok');
}

main();
