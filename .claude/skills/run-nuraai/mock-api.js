async (page) => {
    const at = '2026-09-23T14:02:00.000Z';
    const paged = { limit: 50, offset: 0, has_more: false };
    const team = { id: 1, name: 'Nura Team', description: '', archived_at: null, created_at: at, updated_at: at };
    const agent = (id, name) => ({ id, name, description: '', model_id: 1, model_name: 'Model', document_count: 3, permissions: [], created_at: at });
    const stats = (values) => ({ requests: 0, failures: 0, inbound: 0, replies: 0, day: 0, week: 0, average_ms: 0, last_at: null, ...values });
    const plugin = (values) => ({ config: {}, secrets: {}, agents: [], hook_agent_id: 0, hook_url: '', hook_events: [], hook_secret: 'f3a9c1d2e4b5a6c7', hook_path: '', account: '', enabled: true, listening: false, listen_error: '', stats: stats({}), created_at: at, ...values });
    const kind = (key, label, inbound, fields) => ({ key, label, description: `${label} plugin.`, inbound, inbound_hint: '', fields, tools: [] });
    const field = (key, label, secret) => ({ key, label, secret, required: secret, hint: '', placeholder: '' });
    const call = (id, direction, action, ok) => ({ id, direction, action, ok, status: ok ? 200 : 400, duration_ms: 400 + id * 30, agent_id: 0, agent_name: '', thread: '', request: '{"text":"Sample"}', response: ok ? '{"message_id":812}' : '', error: ok ? '' : 'Bad Request: chat not found', created_at: at });

    const fixtures = {
        'GET /team': { teams: [team], ...paged, total: 1 },
        'GET /team/1': team,
        'GET /team/1/agent': { agents: [agent(1, 'Support'), agent(2, 'Social')], ...paged, total: 2 },
        'GET /team/1/roster': {
            members: [
                { name: 'Alex', roles: ['Administrator', 'Senior software engineer'], description: 'Runs the platform and reviews every release.', social: { telegram: '@alex' } },
                { name: 'Sara', roles: ['Community manager'], description: 'Looks after the Telegram and Discord groups.' },
            ],
            count: 2,
            ...paged,
            total: 2,
        },
        'GET /team/1/model': { models: [{ id: 1, name: 'Model', model: 'gpt-mini', base_url: 'https://api.example.com/v1', context_tokens: 0, created_at: at }], ...paged, total: 1 },
        'GET /team/1/bot': {
            bots: [
                { id: 1, name: 'Front desk', token_hint: '123456:...a1b2', public_url: '', mode: 'polling', agent_id: 1, agent_name: 'Support', groups: true, profiles: [{ id: 3, name: 'Sara K' }], created_at: at },
                { id: 2, name: 'Imported bot', token_hint: '', public_url: '', mode: 'polling', agent_id: 2, agent_name: 'Social', groups: false, profiles: [], created_at: at },
            ],
            ...paged,
            total: 2,
        },
        'GET /team/1/plugin': {
            plugins: [
                plugin({ id: 1, kind: 'telegram', name: 'News channel', agents: [1, 2], hook_agent_id: 1, account: '@nura_news_bot', listening: true, stats: stats({ requests: 130, failures: 2, inbound: 40, replies: 38, week: 124, day: 18, average_ms: 640, last_at: at }) }),
                plugin({ id: 2, kind: 'discord', name: 'Community', agents: [1], account: 'nura-helper', listen_error: 'Discord refused the bot token.', stats: stats({ requests: 12, failures: 9, week: 12, last_at: at }) }),
                plugin({ id: 3, kind: 'x', name: 'Nura on X', enabled: false }),
            ],
        },
        'GET /team/1/plugin/catalog': {
            events: ['message.received', 'agent.replied', 'agent.action', 'agent.failed'],
            kinds: [
                kind('telegram', 'Telegram', 'listen', [field('token', 'Bot token', true), field('default_chat', 'Default chat', false)]),
                kind('x', 'X', 'none', [field('api_key', 'API key', true)]),
                kind('discord', 'Discord', 'listen', [field('token', 'Bot token', true)]),
            ],
        },
        'GET /team/1/plugin/1/call': {
            calls: [call(3, 'tool', 'telegram_send_message', true), call(2, 'in', 'direct', true), call(1, 'tool', 'telegram_send_photo', false)],
            actions: [{ direction: 'tool', action: 'telegram_send_message', count: 96, failures: 1, average_ms: 610, last_at: at }],
            ...paged,
            total: 3,
        },
    };

    await page.context().addInitScript(() => sessionStorage.setItem('accessToken', 'mock-session'));
    await page.context().unrouteAll({ behavior: 'ignoreErrors' });
    await page.context().route('**/api/**', (route) => {
        const url = route.request().url();
        const path = url.slice(url.indexOf('/api') + 4).split('?')[0];
        const key = `${route.request().method()} ${path}`;

        return key in fixtures
            ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures[key]) })
            : route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ result: `MOCK_MISSING ${key}` }) });
    });

    return `mocked ${Object.keys(fixtures).length} endpoints; navigate to http://127.0.0.1:1011/dashboard/team/1/plugins`;
}
