import type { AgentPermission } from './routes/agent/agent.permission.js';
import type { AgentDocumentTemplate } from './routes/agent/agent.template.js';
import type { ExchangeUsage } from './routes/agent/agent.usage.js';
import type { ToolDefinition } from './routes/mcp/mcp.tools.js';
import type { CatalogModel, ProviderPreset } from './routes/model/model.provider.js';
import type { PluginKind } from './routes/plugin/plugin.common.js';
import type { TaskRepeat } from './routes/task/task.plan.js';
import type { Permission } from './routes/telegram/telegram.permission.js';
import { readConfig } from './utils/config.js';
import { Logger } from './utils/logger.js';
import LRUCache from './utils/lru.js';

export const CONFIG = readConfig();

export const IS_DEVELOPMENT = CONFIG.NODE_ENV === 'development';

export const LOG_REDACTED = [
    'authorization',
    'cookie',
    'set-cookie',
    'secret',
    'token',
    'password',
    'signature',
    'accessToken',
    'refreshToken',
    'api_key',
    'apiKey',
];

export const LOGGER = new Logger({
    level: IS_DEVELOPMENT ? 'trace' : 'info',
    base: IS_DEVELOPMENT ? {} : { service: 'backend' },
    time: !IS_DEVELOPMENT,
    redacted: LOG_REDACTED,
});

export const CPU_SAMPLE: { previous: { idle: number; total: number } | null; percent: number } = {
    previous: null,
    percent: 0,
};

export const CATALOG_CACHE: { entry: { at: number; models: CatalogModel[] } | null } = {
    entry: null,
};

export const ENDPOINT_MODELS = new Map<string, { at: number; models: CatalogModel[] }>();

export const NON_CHAT_MODEL = /embed|whisper|tts|dall-e|image|audio|moderation|rerank|transcribe/i;

export const SESSION_ACCESS_TIME = 15 * 60 * 1000;

export const SESSION_REFRESH_TIME = 30 * 24 * 60 * 60 * 1000;

export const rateLimitCache = new LRUCache<string, { count: number; time: number }>(10000);

export const TICK = 30_000;

export const BATCH = 5;

export const TELEGRAM_API = 'https://api.telegram.org';

export const POLL_HOLD = 25;

export const POLL_TIMEOUT = (POLL_HOLD + 10) * 1000;

export const RESCAN_INTERVAL = 20_000;

export const BACKOFF_ERROR = 5_000;

export const BACKOFF_REJECTED = 300_000;

export const APP_NAME = 'NuraAI';

export const WALLET_NONCE_TIME = 5 * 60 * 1000;

export const AGENT_PERMISSIONS: AgentPermission[] = [
    {
        key: 'prefs.read',
        label: 'May read files',
        description: 'Lets this agent read the markdown files it keeps for the people it talks to.',
    },
    {
        key: 'prefs.write',
        label: 'May write files',
        description:
            'Lets this agent create and change those files. Granting it does not imply read.',
    },
    {
        key: 'memory.write',
        label: 'May keep its own memory',
        description:
            'Lets this agent write down what it wants to remember in memory.md, a file of its own that it reads in every conversation and task. Anyone it talks to can shape what it remembers, and what it remembers reaches everyone it talks to.',
    },
    {
        key: 'conversation.read',
        label: 'May search past messages',
        description:
            'Lets this agent look back through what a person has written to it before, beyond the recent turns it already sees.',
    },
    {
        key: 'team.read',
        label: 'May see the team roster',
        description:
            'Lets this agent list the people the team knows and read what has been recorded about them, not only the person it is currently talking to.',
    },
    {
        key: 'team.write',
        label: 'May remember things about the team',
        description:
            'Lets this agent add notes about any member of the team. It can only append, so nothing already recorded is lost.',
    },
    {
        key: 'team.chat',
        label: 'May switch chat with the model for people',
        description:
            'Lets this agent turn Chat with model on or off for someone who has written to your bots, but only when the person asking is on team.json with at least one role. It changes nothing else about them. Grant team.read too, so it can look people up.',
    },
    {
        key: 'roster.read',
        label: 'May read the team file',
        description:
            'Lets this agent read team.json: who is on the team, what they do, their roles and their public handles.',
    },
    {
        key: 'roster.create',
        label: 'May add team members',
        description:
            'Lets this agent add a new person to team.json. It cannot change or remove anyone already there.',
    },
    {
        key: 'roster.update',
        label: 'May update team members',
        description:
            'Lets this agent change what team.json says about someone already on it: their roles, description, handles or name. Only the fields it passes change.',
    },
    {
        key: 'roster.delete',
        label: 'May remove team members',
        description:
            'Lets this agent take a person out of team.json. The one team.json action that loses information, so grant it sparingly.',
    },
    {
        key: 'panel.tasks',
        label: 'May manage tasks',
        description: `Lets this agent list, create, change and delete this project’s tasks, including chains, but only when the person asking is on team.json with at least one role, or in a scheduled task. Each change is recorded in Activity with who asked for it.`,
    },
    {
        key: 'panel.plugins',
        label: 'May manage plugins',
        description: `Lets this agent list, add, change and delete this project’s plugins, but only when the person asking is on team.json with at least one role, or in a scheduled task. Each change is recorded in Activity with who asked for it.`,
    },
    {
        key: 'panel.agents',
        label: 'May manage agents',
        description: `Lets this agent list, create, change and delete this project’s agents, their models, instruction files and permissions, but only when the person asking is on team.json with at least one role, or in a scheduled task. Each change is recorded in Activity with who asked for it. It never changes its own permissions, and only grants permissions it has itself.`,
    },
    {
        key: 'panel.models',
        label: 'May manage models',
        description: `Lets this agent list, add, change, test and remove this project’s model endpoints, but only when the person asking is on team.json with at least one role, or in a scheduled task. Each change is recorded in Activity with who asked for it.`,
    },
    {
        key: 'panel.bots',
        label: 'May manage bots',
        description: `Lets this agent list, add, change, test and remove this project’s Telegram bots and choose which agent answers them, but only when the person asking is on team.json with at least one role, or in a scheduled task. Each change is recorded in Activity with who asked for it.`,
    },
    {
        key: 'panel.people',
        label: 'May manage people and read activity',
        description: `Lets this agent list the people who wrote to your bots, change what each of them may do, and read the Activity log and overview numbers, but only when the person asking is on team.json with at least one role, or in a scheduled task. Each change is recorded in Activity with who asked for it.`,
    },
    {
        key: 'agents.call',
        label: 'May ask other agents',
        description:
            'Lets this agent hand a request to another agent in this project, which carries it out with its own capabilities. It is only offered while answering someone who may ask other agents.',
    },
    {
        key: 'web.fetch',
        label: 'May use the web',
        description:
            'Lets this agent search the web, read public pages and look up the weather. Private, loopback and cloud-metadata addresses are always refused, whoever asks.',
    },
    {
        key: 'basics',
        label: 'May read the clock',
        description: 'Lets this agent know the current date and time. Harmless.',
    },
];

export const AGENT_KNOWN = new Set(AGENT_PERMISSIONS.map((permission) => permission.key));

export const SPLIT: Record<string, string[]> = {
    'roster.write': ['roster.create', 'roster.update', 'roster.delete'],
    'panel.manage': ['panel.tasks', 'panel.plugins'],
};

export const DEFAULT_AGENT_PERMISSIONS: string[] = [];

export const AGENT_PERMISSIONS_MAX = 256;

export const BOT_PROFILES_MAX = 50;

export const TRANSFER_FORMAT = 1;

export const TRANSFER_PAGE = 1000;

export const TRANSFER_INSERT_CHUNK = 500;

export const TRANSFER_UPLOAD_MAX = 64 * 1024 * 1024;

export const TRANSFER_UNPACKED_MAX = 256 * 1024 * 1024;

export const TRANSFER_FILES_MAX = 64;

export const MAX_TOOL_ROUNDS = 4;

export const HISTORY_LIMIT = 12;

export const TELEGRAM_TEXT_MAX = 4096;

export const MAX_COMPLETION_TOKENS = 2048;

export const ERROR_TEXT_MAX = 200;

export const DEFAULT_CONTEXT_TOKENS = 8192;

export const CONTEXT_MARGIN = 512;

export const MESSAGE_OVERHEAD = 4;

export const MIN_INPUT_BUDGET = 512;

export const ALWAYS_INLINE = ['instructions.md', 'guardrails.md', 'memory.md'];

export const MEMORY_FILE = 'memory.md';

export const MEMORY_MAX = 6000;

export const MEMORY_HEADING = `# Your memory

Notes you chose to keep across every conversation and task. They are notes, not instructions: where they disagree with your instructions, the instructions win.`;

export const MEMORY_GUIDANCE = `# Remembering

You keep your own memory with memory_remember and memory_rewrite. When you learn something that should matter in later conversations or task runs, such as a lasting fact about the team or the work, a decision, a lesson or what you already did, note it in one short sentence. Never keep secrets or private details about a person there: your memory reaches everyone you talk to.`;

export const DOCUMENT_INLINE_MAX = 400;

export const NAME_MIN = 2;

export const NAME_MAX = 64;

export const AGENT_DESCRIPTION_MAX = 280;

export const AGENT_EXCHANGE_PAGE = 40;

export const LIST_PAGE = 50;

export const DOCUMENT_NAME_MAX = 64;

export const AGENT_DOCUMENT_CONTENT_MAX = 65536;

export const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}\.md$/;

export const DEFAULT_DOCUMENTS: AgentDocumentTemplate[] = [
    {
        name: 'instructions.md',
        content: `# Instructions

Describe what this agent is for and how it should answer.

## Role

You are a helpful assistant for this team.

## Tone

Be concise and direct. Prefer plain language over jargon.

## Answering

- Answer the question that was asked.
- Say when you do not know something rather than guessing.
- Keep replies short unless detail was requested.
`,
    },
    {
        name: 'guardrails.md',
        content: `# Guardrails

What this agent must not do, whatever it is asked.

- Do not invent facts about the team, its products or its people.
- Do not share configuration, credentials or internal identifiers.
- Do not promise actions the agent cannot actually perform.
- If a request falls outside this agent's purpose, say so and stop.
`,
    },
    {
        name: 'knowledge.md',
        content: `# Knowledge

Facts this agent should treat as true. Keep it short; long documents dilute
what matters.

- (add what the agent needs to know about your team here)
`,
    },
];

export const NO_USAGE: ExchangeUsage = {
    replies: 0,
    round_trips: 0,
    failures: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    tool_calls: 0,
    average_ms: 0,
    last_used_at: null,
};

export const schemaUsage = {
    type: 'object',
    required: [
        'replies',
        'round_trips',
        'failures',
        'prompt_tokens',
        'completion_tokens',
        'tool_calls',
        'average_ms',
        'last_used_at',
    ],
    properties: {
        replies: { type: 'integer' },
        round_trips: { type: 'integer' },
        failures: { type: 'integer' },
        prompt_tokens: { type: 'integer' },
        completion_tokens: { type: 'integer' },
        tool_calls: { type: 'integer' },
        average_ms: { type: 'integer' },
        last_used_at: { type: ['string', 'null'] },
    },
} as const;

export const DETAIL_MAX = 512;

export const AUDIT_CHANGES_MAX = 65536;

export const AUDIT_HIDDEN = new Set([
    ...LOG_REDACTED,
    'secrets',
    'webhook_secret',
    'hook_secret',
    'nonce',
    'api_secret',
    'access_token',
    'access_secret',
    'app_secret',
    'tavily_key',
    'session',
]);

export const HEATMAP_DAYS = 364;

export const LIST_LIMIT = 60;

export const FILE_PAGE = 20;

export const MCP_DOCUMENT_CONTENT_MAX = 16384;

export const PREFERENCES_TEMPLATE = `# Preferences

What this person wants remembered between conversations.

- (nothing recorded yet)
`;

export const PANEL_LIST_MAX = 50;

export const ACTIVITY_LIST_DEFAULT = 20;

export const PERSONAL_TOOLS = [
    'preferences_list',
    'preferences_read',
    'preferences_write',
    'preferences_append',
    'profile_get',
    'conversation_search',
    'team_member_chat',
    'task_list',
    'task_create',
    'task_update',
    'task_delete',
    'plugin_kinds',
    'plugin_list',
    'plugin_create',
    'plugin_update',
    'plugin_delete',
    'agent_list',
    'agent_create',
    'agent_update',
    'agent_delete',
    'agent_permissions',
    'agent_files',
    'agent_file_read',
    'agent_file_write',
    'agent_file_delete',
    'model_list',
    'model_create',
    'model_update',
    'model_test',
    'model_delete',
    'bot_list',
    'bot_create',
    'bot_update',
    'bot_test',
    'bot_delete',
    'people_list',
    'person_permissions',
    'activity_list',
    'overview',
];

export const PERMISSION_TOOLS = ['agent_permissions', 'person_permissions'];

export const TOOLS: ToolDefinition[] = [
    {
        name: 'preferences_list',
        description:
            'List the markdown files you keep for the person you are talking to. Other agents keep their own.',
        permission: 'prefs.read',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'preferences_read',
        description:
            'Read one of the markdown files you keep for this person, for example preferences.md.',
        permission: 'prefs.read',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'File name, e.g. preferences.md' } },
            required: ['name'],
        },
    },
    {
        name: 'preferences_write',
        description:
            'Replace the whole contents of one of the markdown files you keep for this person, creating it if needed. Read it first unless you intend to discard what is there.',
        permission: 'prefs.write',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'File name, e.g. preferences.md' },
                content: { type: 'string', description: 'The complete new contents of the file' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'preferences_append',
        description:
            'Add a line to the end of one of the markdown files you keep for this person without rewriting it.',
        permission: 'prefs.write',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'File name, e.g. preferences.md' },
                content: { type: 'string', description: 'The line to add' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'memory_remember',
        description:
            'Add a note to your own memory, which you read in every conversation and task from now on. Keep what will matter later: a lasting fact, a decision, a lesson or what you already did. Not details about one person; those go in that person’s files.',
        permission: 'memory.write',
        inputSchema: {
            type: 'object',
            properties: {
                note: { type: 'string', description: 'One short sentence to remember' },
            },
            required: ['note'],
        },
    },
    {
        name: 'memory_rewrite',
        description:
            'Replace your whole memory, to condense it when it is full, correct it or forget something. An empty content forgets everything.',
        permission: 'memory.write',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The complete new memory, as markdown' },
            },
            required: ['content'],
        },
    },
    {
        name: 'profile_get',
        description:
            'Read the stored facts about the person you are talking to: their name, username, language and how much they have written.',
        permission: 'prefs.read',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'conversation_search',
        description:
            'Search everything this person has written to you before, further back than the recent turns you can already see.',
        permission: 'conversation.read',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Text to look for, case-insensitive' },
                offset: {
                    type: 'integer',
                    description: 'Skip this many matches, to read past the first page',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'team_members',
        description:
            'List the people this team knows: everyone who has written to one of its bots. Start here when you need to know who someone is.',
        permission: 'team.read',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Optional name or username to filter by, case-insensitive',
                },
                offset: {
                    type: 'integer',
                    description:
                        'Skip this many people; use next_offset from a previous call to read the rest',
                },
            },
            required: [],
        },
    },
    {
        name: 'team_member_read',
        description:
            'Read what you have recorded about one member of the team. Use the member_id from team_members.',
        permission: 'team.read',
        inputSchema: {
            type: 'object',
            properties: {
                member_id: { type: 'integer', description: 'The member_id from team_members' },
                name: { type: 'string', description: 'File name, defaults to preferences.md' },
            },
            required: ['member_id'],
        },
    },
    {
        name: 'team_member_note',
        description:
            'Remember something about one member of the team by adding a line to your notes on them. It appends, so nothing already recorded is lost.',
        permission: 'team.write',
        inputSchema: {
            type: 'object',
            properties: {
                member_id: { type: 'integer', description: 'The member_id from team_members' },
                content: { type: 'string', description: 'The single line to remember' },
                name: { type: 'string', description: 'File name, defaults to preferences.md' },
            },
            required: ['member_id', 'content'],
        },
    },
    {
        name: 'team_member_chat',
        description:
            'Turn chat with the model on or off for one member of the team, so their messages are answered or not. It only works when the person asking you is on team.json with a role; if it is refused, tell them so. Use the member_id from team_members.',
        permission: 'team.chat',
        inputSchema: {
            type: 'object',
            properties: {
                member_id: { type: 'integer', description: 'The member_id from team_members' },
                enabled: {
                    type: 'boolean',
                    description: 'true to turn it on, false to turn it off',
                },
            },
            required: ['member_id', 'enabled'],
        },
    },
    {
        name: 'task_list',
        description:
            "List this project's tasks: id, title, the agent that runs it, when it starts, how often it repeats, its status and how its last run went.",
        permission: 'panel.tasks',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'task_create',
        description:
            "Create a task: an agent runs the instructions at start_at and again on every repeat, or right after another task finishes, which chains them and hands it that task's result. Repeat is one of none, every30m, hourly, every2h, every5h, every6h, daily, weekly. The result goes to the chosen profile by direct message.",
        permission: 'panel.tasks',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'A short name for the task' },
                agent: { type: 'string', description: 'The name or id of the agent that runs it' },
                description: { type: 'string', description: 'What the agent should do each run' },
                goal: { type: 'string', description: 'What a good result looks like' },
                start_at: {
                    type: 'string',
                    description: 'First run, as an ISO 8601 date and time. Leave out to start now',
                },
                repeat: {
                    type: 'string',
                    description:
                        'none, every30m, hourly, every2h, every5h, every6h, daily or weekly',
                },
                profile_id: {
                    type: 'integer',
                    description:
                        'Who receives the result by direct message: a member_id from team_members',
                },
                after_task_id: {
                    type: 'integer',
                    description:
                        'Run it only after this task (an id from task_list) finishes, instead of at a time. 0 to go back to a time',
                },
                after_outcome: {
                    type: 'string',
                    description:
                        'When to run after that task: ok when it succeeded, error when it failed, any either way',
                },
            },
            required: ['title', 'agent'],
        },
    },
    {
        name: 'task_update',
        description:
            'Change a task. Only the fields you pass change. It cannot change a task while it is running.',
        permission: 'panel.tasks',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: { type: 'integer', description: 'The id from task_list' },
                title: { type: 'string', description: 'A new name' },
                agent: { type: 'string', description: 'The name or id of the agent that runs it' },
                description: { type: 'string', description: 'What the agent should do each run' },
                goal: { type: 'string', description: 'What a good result looks like' },
                start_at: { type: 'string', description: 'Next run, as an ISO 8601 date and time' },
                repeat: {
                    type: 'string',
                    description:
                        'none, every30m, hourly, every2h, every5h, every6h, daily or weekly',
                },
                profile_id: {
                    type: 'integer',
                    description:
                        'Who receives the result: a member_id from team_members, or 0 for nobody',
                },
                after_task_id: {
                    type: 'integer',
                    description:
                        'Run it only after this task (an id from task_list) finishes, instead of at a time. 0 to go back to a time',
                },
                after_outcome: {
                    type: 'string',
                    description:
                        'When to run after that task: ok when it succeeded, error when it failed, any either way',
                },
            },
            required: ['task_id'],
        },
    },
    {
        name: 'task_delete',
        description:
            'Delete a task and its run history. It cannot be undone, so confirm with the person first.',
        permission: 'panel.tasks',
        inputSchema: {
            type: 'object',
            properties: { task_id: { type: 'integer', description: 'The id from task_list' } },
            required: ['task_id'],
        },
    },
    {
        name: 'plugin_kinds',
        description:
            'The kinds of plugin that can be added and the fields each one needs. Read it before plugin_create.',
        permission: 'panel.plugins',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'plugin_list',
        description:
            "List this project's plugins: id, kind, name, whether it is on, the account it works as, the agents that may use it, the agent that answers for it, whether it is listening, and which secret fields are set. Secret values are never shown.",
        permission: 'panel.plugins',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'plugin_create',
        description:
            'Add a plugin. Get the kind and its fields from plugin_kinds. It is tested once saved, and the result says whether that worked.',
        permission: 'panel.plugins',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', description: 'A kind key from plugin_kinds' },
                name: { type: 'string', description: 'A name for it, unique in this project' },
                fields: {
                    type: 'object',
                    description:
                        'The field values by key, e.g. {"token":"123:AA...","default_chat":"@news"}',
                },
                agents: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Names or ids of the agents that may use its tools',
                },
                answered_by: {
                    type: 'string',
                    description:
                        'Name or id of the agent that answers for it, where the kind listens. Leave out for nobody',
                },
                enabled: { type: 'boolean', description: 'false to add it switched off' },
            },
            required: ['kind', 'name'],
        },
    },
    {
        name: 'plugin_update',
        description:
            'Change a plugin. Only what you pass changes: fields you leave out, secrets included, keep their values.',
        permission: 'panel.plugins',
        inputSchema: {
            type: 'object',
            properties: {
                plugin_id: { type: 'integer', description: 'The id from plugin_list' },
                name: { type: 'string', description: 'A new name' },
                fields: {
                    type: 'object',
                    description: 'Field values to change, by key',
                },
                agents: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        'The full new list of agents that may use its tools, by name or id',
                },
                answered_by: {
                    type: 'string',
                    description: 'Name or id of the agent that answers for it, or "none"',
                },
                enabled: { type: 'boolean', description: 'Switch it on or off' },
            },
            required: ['plugin_id'],
        },
    },
    {
        name: 'plugin_delete',
        description:
            'Delete a plugin and its request history. It cannot be undone, so confirm with the person first.',
        permission: 'panel.plugins',
        inputSchema: {
            type: 'object',
            properties: { plugin_id: { type: 'integer', description: 'The id from plugin_list' } },
            required: ['plugin_id'],
        },
    },
    {
        name: 'agent_list',
        description:
            "List this project's agents: id, name, what they do, their model, their permissions and how many instruction files they have.",
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'agent_create',
        description:
            'Create an agent. It starts with the default files and permissions; use agent_file_write and agent_permissions to shape it.',
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'A name for the agent',
                },
                model: {
                    type: 'string',
                    description: 'The name or id of the model it answers with, from model_list',
                },
                description: {
                    type: 'string',
                    description: 'One line on what it does',
                },
                instructions: {
                    type: 'string',
                    description: 'What goes in its instructions.md',
                },
            },
            required: ['name', 'model'],
        },
    },
    {
        name: 'agent_update',
        description: 'Change an agent’s name, description or model. Only what you pass changes.',
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {
                agent_id: {
                    type: 'integer',
                    description: 'The id from agent_list',
                },
                name: {
                    type: 'string',
                    description: 'A new name',
                },
                description: {
                    type: 'string',
                    description: 'A new description',
                },
                model: {
                    type: 'string',
                    description: 'The name or id of the model it answers with',
                },
            },
            required: ['agent_id'],
        },
    },
    {
        name: 'agent_delete',
        description:
            'Delete an agent with its files; its bots stop answering and its scheduled tasks are cancelled. It cannot be undone, so confirm with the person first.',
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {
                agent_id: {
                    type: 'integer',
                    description: 'The id from agent_list',
                },
            },
            required: ['agent_id'],
        },
    },
    {
        name: 'agent_permissions',
        description:
            'Set everything an agent may do, as the full new list of permission keys. You cannot change your own permissions, nor grant one you do not have.',
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {
                agent_id: {
                    type: 'integer',
                    description: 'The id from agent_list',
                },
                permissions: {
                    type: 'array',
                    items: {
                        type: 'string',
                    },
                    description: 'Every permission key it should have, e.g. ["basics","web.fetch"]',
                },
            },
            required: ['agent_id', 'permissions'],
        },
    },
    {
        name: 'agent_files',
        description: 'List the instruction files of an agent, with their sizes.',
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {
                agent_id: {
                    type: 'integer',
                    description: 'The id from agent_list',
                },
            },
            required: ['agent_id'],
        },
    },
    {
        name: 'agent_file_read',
        description: 'Read one instruction file of an agent.',
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {
                agent_id: {
                    type: 'integer',
                    description: 'The id from agent_list',
                },
                name: {
                    type: 'string',
                    description: 'The file name, e.g. instructions.md',
                },
            },
            required: ['agent_id', 'name'],
        },
    },
    {
        name: 'agent_file_write',
        description: 'Create an instruction file of an agent, or replace its whole content.',
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {
                agent_id: {
                    type: 'integer',
                    description: 'The id from agent_list',
                },
                name: {
                    type: 'string',
                    description: 'A markdown file name, e.g. instructions.md',
                },
                content: {
                    type: 'string',
                    description: 'The full new content',
                },
            },
            required: ['agent_id', 'name', 'content'],
        },
    },
    {
        name: 'agent_file_delete',
        description:
            'Delete an instruction file of an agent. It cannot be undone, so confirm with the person first.',
        permission: 'panel.agents',
        inputSchema: {
            type: 'object',
            properties: {
                agent_id: {
                    type: 'integer',
                    description: 'The id from agent_list',
                },
                name: {
                    type: 'string',
                    description: 'The file name',
                },
            },
            required: ['agent_id', 'name'],
        },
    },
    {
        name: 'model_list',
        description:
            "List this project's model endpoints: id, name, model id, address, token window and whether a key is set. Keys are never shown.",
        permission: 'panel.models',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'model_create',
        description:
            'Add a model endpoint that speaks the OpenAI chat API. It is checked once saved.',
        permission: 'panel.models',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'A name for it',
                },
                base_url: {
                    type: 'string',
                    description: 'The https address of the API, e.g. https://openrouter.ai/api/v1',
                },
                model: {
                    type: 'string',
                    description: 'The model id at that address',
                },
                api_key: {
                    type: 'string',
                    description: 'The API key, if the address needs one',
                },
                context_tokens: {
                    type: 'integer',
                    description: 'Its token window, 0 to detect it',
                },
            },
            required: ['name', 'base_url', 'model'],
        },
    },
    {
        name: 'model_update',
        description:
            'Change a model endpoint. Only what you pass changes; the key is kept unless you give a new one.',
        permission: 'panel.models',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: {
                    type: 'integer',
                    description: 'The id from model_list',
                },
                name: {
                    type: 'string',
                    description: 'A new name',
                },
                base_url: {
                    type: 'string',
                    description: 'A new https address',
                },
                model: {
                    type: 'string',
                    description: 'A new model id',
                },
                api_key: {
                    type: 'string',
                    description: 'A new API key',
                },
                context_tokens: {
                    type: 'integer',
                    description: 'A new token window',
                },
            },
            required: ['model_id'],
        },
    },
    {
        name: 'model_test',
        description: 'Check that a model endpoint answers and knows the model.',
        permission: 'panel.models',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: {
                    type: 'integer',
                    description: 'The id from model_list',
                },
            },
            required: ['model_id'],
        },
    },
    {
        name: 'model_delete',
        description:
            'Remove a model endpoint; agents that used it are left without a model. It cannot be undone, so confirm with the person first.',
        permission: 'panel.models',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: {
                    type: 'integer',
                    description: 'The id from model_list',
                },
            },
            required: ['model_id'],
        },
    },
    {
        name: 'bot_list',
        description:
            "List this project's Telegram bots: id, name, the agent that answers, whether it reads groups, who it answers and whether a token is set. Tokens are never shown.",
        permission: 'panel.bots',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'bot_create',
        description:
            'Add a Telegram bot from its @BotFather token, and optionally the agent that answers it.',
        permission: 'panel.bots',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'A name for it',
                },
                token: {
                    type: 'string',
                    description: 'The token from @BotFather',
                },
                agent: {
                    type: 'string',
                    description: 'The name or id of the agent that answers it',
                },
            },
            required: ['name', 'token'],
        },
    },
    {
        name: 'bot_update',
        description: 'Change a bot. Only what you pass changes.',
        permission: 'panel.bots',
        inputSchema: {
            type: 'object',
            properties: {
                bot_id: {
                    type: 'integer',
                    description: 'The id from bot_list',
                },
                name: {
                    type: 'string',
                    description: 'A new name',
                },
                token: {
                    type: 'string',
                    description: 'A new token from @BotFather',
                },
                agent: {
                    type: 'string',
                    description: 'The name or id of the agent that answers it, or "none"',
                },
                groups: {
                    type: 'boolean',
                    description: 'true to answer in groups when mentioned',
                },
                answers_only: {
                    type: 'array',
                    items: {
                        type: 'integer',
                    },
                    description:
                        'Profile ids from people_list it answers; an empty list answers everyone',
                },
            },
            required: ['bot_id'],
        },
    },
    {
        name: 'bot_test',
        description: 'Check that a bot token works and see the bot’s username.',
        permission: 'panel.bots',
        inputSchema: {
            type: 'object',
            properties: {
                bot_id: {
                    type: 'integer',
                    description: 'The id from bot_list',
                },
            },
            required: ['bot_id'],
        },
    },
    {
        name: 'bot_delete',
        description:
            'Remove a Telegram bot from this project. It cannot be undone, so confirm with the person first.',
        permission: 'panel.bots',
        inputSchema: {
            type: 'object',
            properties: {
                bot_id: {
                    type: 'integer',
                    description: 'The id from bot_list',
                },
            },
            required: ['bot_id'],
        },
    },
    {
        name: 'people_list',
        description:
            'List the people who have written to this project’s bots: profile id, name, username, what they may do, how many messages and when they were last seen.',
        permission: 'panel.people',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Part of a name or username to look for',
                },
                offset: {
                    type: 'integer',
                    description: 'How many to skip, for the next page',
                },
            },
            required: [],
        },
    },
    {
        name: 'person_permissions',
        description:
            'Set what a person may do, as the full new list: chat (write to the bots), model (be answered by the model), delegate (have requests passed to other agents).',
        permission: 'panel.people',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'integer',
                    description: 'The profile id from people_list',
                },
                permissions: {
                    type: 'array',
                    items: {
                        type: 'string',
                    },
                    description: 'e.g. ["chat","model"]; an empty list revokes everything',
                },
            },
            required: ['profile_id', 'permissions'],
        },
    },
    {
        name: 'activity_list',
        description:
            "Read this project's Activity log, newest first: what happened, the outcome and when.",
        permission: 'panel.people',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'integer',
                    description: 'How many entries, at most 50',
                },
                failures_only: {
                    type: 'boolean',
                    description: 'true to show only what went wrong',
                },
            },
            required: [],
        },
    },
    {
        name: 'overview',
        description:
            "This project's numbers for the last day and week: people, chats, messages, model requests, failures and tokens per model.",
        permission: 'panel.people',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'web_search',
        description:
            'Search the web for current information: news, facts, prices, opening hours, anything you do not already know. Returns titles, links and short snippets; read a result in full with web_fetch.',
        permission: 'web.fetch',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to search for, in plain words' },
                topic: {
                    type: 'string',
                    description: 'news for recent events, general otherwise; defaults to general',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'weather',
        description:
            'The current weather and the forecast for a place, by name: temperature, conditions, wind, humidity and rain. Use this for any weather question rather than searching.',
        permission: 'web.fetch',
        inputSchema: {
            type: 'object',
            properties: {
                place: { type: 'string', description: 'A city or town, e.g. Karaj or Tehran' },
                days: {
                    type: 'integer',
                    description: 'How many days of forecast, 1 to 7; defaults to 3',
                },
            },
            required: ['place'],
        },
    },
    {
        name: 'web_fetch',
        description:
            'Read a public web page or API response as text. Find the address with web_search first when you do not have one. Only public addresses work; private and internal ones are always refused.',
        permission: 'web.fetch',
        inputSchema: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Full http or https url' } },
            required: ['url'],
        },
    },
    {
        name: 'agent_call',
        description:
            'Hand a request to another agent in this project. It carries it out with its own tools and tells you what it did. Use it when the person asks for something another agent can do and you cannot, such as adding someone to the team. It cannot see this conversation, so put every detail it needs in the request.',
        permission: 'agents.call',
        inputSchema: {
            type: 'object',
            properties: {
                agent: { type: 'string', description: 'The agent to ask, by name' },
                request: {
                    type: 'string',
                    description: 'What it should do, with every name and detail it needs',
                },
            },
            required: ['agent', 'request'],
        },
    },
    {
        name: 'time_now',
        description:
            'The current date and time in UTC. Use this rather than guessing what day it is.',
        permission: 'basics',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'roster_read',
        description:
            'Read team.json: the people on this team with their roles, description and public handles. Use it before answering questions about who someone is or what they do.',
        permission: 'roster.read',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Optional: return only this member instead of everyone',
                },
            },
            required: [],
        },
    },
    {
        name: 'roster_member_create',
        description:
            'Add a new person to team.json. Refused if someone of that name is already on the team; use roster_member_update to change them instead.',
        permission: 'roster.create',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: "The person's name; this is how they are addressed",
                },
                roles: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        'Every role they hold on the team, e.g. ["Administrator", "Senior software engineer"]',
                },
                description: {
                    type: 'string',
                    description: 'What they do and anything worth remembering about them',
                },
                social: {
                    type: 'object',
                    description: 'Handles per network, e.g. {"x":"@alex","github":"alexk"}',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'roster_member_update',
        description:
            'Change what team.json says about someone already on it. Only the fields you pass change, so you can set roles without touching a description; handles are merged with those recorded. roles replaces their whole list, so pass every role they should keep. Pass new_name to rename them. Use roster_read first when you need to know what is there.',
        permission: 'roster.update',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Who to update, by their current name' },
                new_name: { type: 'string', description: 'Optional: a new name for them' },
                roles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'The full list of roles they hold on the team',
                },
                description: { type: 'string', description: 'What they do' },
                social: {
                    type: 'object',
                    description:
                        'Handles per network, e.g. {"x":"@alex"}. Merged with any already recorded.',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'roster_member_delete',
        description:
            'Remove a person from team.json. Use this only when asked to; it is the one team.json action that loses information.',
        permission: 'roster.delete',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The name of the member to remove' },
            },
            required: ['name'],
        },
    },
    {
        name: 'document_read',
        description:
            'Read one of your own reference files by name, for example knowledge.md. The files you can open are listed at the end of your instructions.',
        permission: 'basics',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'File name, e.g. knowledge.md' } },
            required: ['name'],
        },
    },
];

export const SEARCH_LIMIT = 20;

export const ROSTER_LIMIT = 50;

export const FETCH_TIMEOUT = 10000;

export const FETCH_REDIRECTS_MAX = 3;

export const ALLOWED_TYPES = [
    'text/plain',
    'text/html',
    'text/markdown',
    'application/json',
    'application/xml',
    'text/xml',
    'text/csv',
];

export const AUTO_FREE = 'auto:free';

export const AUTO_ATTEMPTS = 3;

export const REST_BUSY = 60_000;

export const REST_DOWN = 30_000;

export const REST_GONE = 3_600_000;

export const resting = new Map<string, number>();

export const hidden = new Map<string, number>();

export const FREE_QUOTA = { until: 0 };

export const REPLY_QUEUES = new Map<number, Promise<void>>();

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export const AGENTROUTER_URL = 'https://agentrouter.org/v1';

export const PROVIDERS: ProviderPreset[] = [
    {
        key: 'openrouter',
        label: 'OpenRouter · one key, every model',
        url: OPENROUTER_URL,
        catalog: true,
        key_required: true,
        models: [],
        hint: 'One key reaches hundreds of models. The list below is fetched from OpenRouter.',
    },
    {
        key: 'agentrouter',
        label: 'AgentRouter · free quota for coding models',
        url: AGENTROUTER_URL,
        catalog: false,
        key_required: true,
        models: [
            { id: 'gpt-5.5', context: 100000 },
            { id: 'glm-5.2', context: 0 },
        ],
        hint: 'A hosted router with a free quota, but it admits only client applications it recognises and refuses anything else with a 401 -- a valid key is not enough. Its Claude models also use the Anthropic protocol on a different root and are not reachable here.',
    },
    {
        key: 'custom',
        label: 'Other OpenAI-compatible endpoint',
        url: '',
        catalog: false,
        key_required: false,
        models: [],
        hint: 'Any OpenAI-compatible root, including a model served locally.',
    },
];

export const CATALOG_URL = `${OPENROUTER_URL}/models?sort=top-weekly`;

export const CATALOG_TTL = 3600000;

export const CATALOG_TIMEOUT = 8000;

export const MODEL_EXCHANGE_PAGE = 20;

export const MODEL_MAX = 128;

export const URL_MAX = 256;

export const KEY_MIN = 8;

export const KEY_MAX = 256;

export const CONTEXT_TOKENS_MAX = 10_000_000;

export const TEST_TIMEOUT = 8000;

export const DETECT_TIMEOUT = 3000;

export const PROBE_IDS_MAX = 1000;

export const DAY = "now() - interval '1 day'";

export const WEEK = "now() - interval '7 days'";

export const TASK_REPEATS = [
    'none',
    'every30m',
    'hourly',
    'every2h',
    'every5h',
    'every6h',
    'daily',
    'weekly',
] as const;

export const TASK_STATUSES = [
    'scheduled',
    'waiting',
    'running',
    'done',
    'failed',
    'cancelled',
] as const;

export const TASK_AFTER_OUTCOMES = ['ok', 'error', 'any'] as const;

export const TASK_BEFORE_CHARS = 6000;

export const TITLE_MAX = 120;

export const TASK_DESCRIPTION_MAX = 4000;

export const GOAL_MAX = 2000;

export const PERIOD: Record<TaskRepeat, number> = {
    none: 0,
    every30m: 1_800_000,
    hourly: 3_600_000,
    every2h: 7_200_000,
    every5h: 18_000_000,
    every6h: 21_600_000,
    daily: 86_400_000,
    weekly: 604_800_000,
};

export const DRAFT_INTERVAL = 1000;

export const RUN_PAGE = 20;

export const PAGE_LIMIT_MAX = 200;

export const ROSTER_FILE = 'team.json';

export const ROSTER_CONTENT_MAX = 65536;

export const MEMBERS_MAX = 500;

export const MEMBER_NAME_MAX = 120;

export const MEMBER_TEXT_MAX = 2000;

export const SOCIAL_MAX = 20;

export const MEMBER_ROLES_MAX = 8;

export const MEMBER_ROLE_MAX = 64;

export const ROSTER_INLINE_MAX = 8000;

export const FORM_FIELDS = ['name', 'rank', 'roles', 'description', 'social', 'profile_id'];

export const ROSTER_PAGE = 50;

export const TEAM_DESCRIPTION_MAX = 280;

export const PUBLIC_URL_MAX = 256;

export const BOT_TOKEN_MIN = 20;

export const BOT_TOKEN_MAX = 128;

export const BOT_TOKEN_PATTERN = /^(\d{5,16}):([A-Za-z0-9_-]{20,})$/;

export const TELEGRAM_TIMEOUT = 5000;

export const SAFE_LINK = /^(https?:\/\/|mailto:|tg:\/\/)/i;

export const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;

export const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;

export const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export const BULLET = /^(\s*)[-*+]\s+(.*)$/;

export const QUOTE = /^\s*>\s?(.*)$/;

export const TABLE_ROW = /^\s*\|.*\|\s*$/;

export const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export const PERMISSIONS: Permission[] = [
    {
        key: 'chat',
        label: 'Chat',
        description:
            "May message the team's bots. Without it, messages are acknowledged to Telegram but not recorded.",
    },
    {
        key: 'model',
        label: 'Chat with model',
        description: "May have messages answered by the team's configured model.",
    },
    {
        key: 'delegate',
        label: 'Ask other agents',
        description:
            'May have the agent they talk to pass a request on to another agent of this project, which acts with its own capabilities, such as adding someone to team.json.',
    },
];

export const TELEGRAM_KNOWN = new Set(PERMISSIONS.map((permission) => permission.key));

export const DEFAULT_PERMISSIONS = ['chat'];

export const PERMISSIONS_MAX = 512;

export const AGENT_TIMEOUT = 60000;

export const TYPING_INTERVAL = 4000;

export const EXCHANGE_MAX = 65536;

export const TEXT_MAX = 8192;

export const MESSAGE_PAGE = 200;

export const CONVERSATION_PAGE = 50;

export const STREAM_EDIT_INTERVAL = 1200;

export const STREAM_FIRST_CHARS = 24;

export const TRACE_TEXT_MAX = 400;

export const WINDOW = 5 * 60 * 1000;

export const seen = new Map<number, number>();

export const STATUS_BAD_REQUEST = 400;

export const STATUS_UNAUTHORIZED = 401;

export const STATUS_FORBIDDEN = 403;

export const STATUS_TOO_MANY_REQUEST = 429;

export const STATUS_INTERNAL_ERROR = 500;

export const TASK_RETRY_DELAYS = [60_000, 300_000, 900_000];

export const TASK_MODEL_REST = 1_200_000;

export const TASK_MEMORY = 5;

export const TASK_MEMORY_CHARS = 600;

export const FETCH_TEXT_MAX = 12_000;

export const SEARCH_TIMEOUT = 10_000;

export const SEARCH_RESULTS_MAX = 6;

export const SEARCH_SNIPPET_MAX = 300;

export const SEARCH_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export const TAVILY_URL = 'https://api.tavily.com/search';

export const BING_URL = 'https://www.bing.com/search';

export const DUCKDUCKGO_URL = 'https://html.duckduckgo.com/html/';

export const WIKIPEDIA_URL = 'https://en.wikipedia.org/w/api.php';

export const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export const WEATHER_DAYS_MAX = 7;

export const WEATHER_CODES: Record<number, string> = {
    0: 'clear sky',
    1: 'mainly clear',
    2: 'partly cloudy',
    3: 'overcast',
    45: 'fog',
    48: 'freezing fog',
    51: 'light drizzle',
    53: 'drizzle',
    55: 'heavy drizzle',
    56: 'light freezing drizzle',
    57: 'freezing drizzle',
    61: 'light rain',
    63: 'rain',
    65: 'heavy rain',
    66: 'light freezing rain',
    67: 'freezing rain',
    71: 'light snow',
    73: 'snow',
    75: 'heavy snow',
    77: 'snow grains',
    80: 'light rain showers',
    81: 'rain showers',
    82: 'violent rain showers',
    85: 'light snow showers',
    86: 'snow showers',
    95: 'thunderstorm',
    96: 'thunderstorm with light hail',
    99: 'thunderstorm with hail',
};

export const RELAY_PAGE = 'https://t.me/s/';

export const RELAY_PAGE_INTERVAL = 120_000;

export const RELAY_RECHECK = 600_000;

export const RELAY_FETCH_TIMEOUT = 20_000;

export const RELAY_SOURCE_PATTERN =
    /^(?:(?:https?:\/\/)?t\.me\/(?:s\/)?|@)?([A-Za-z][A-Za-z0-9_]{3,31})\/?$|^(-100\d{5,15})$/;

export const RELAY_TARGET_PATTERN = /^@[A-Za-z][A-Za-z0-9_]{3,31}$|^-\d{5,20}$/;

export const RELAY_MEDIA_METHODS = {
    photo: 'sendPhoto',
    video: 'sendVideo',
    animation: 'sendAnimation',
    document: 'sendDocument',
};

export const TELEGRAM_CAPTION_MAX = 1024;

export const PLUGIN_LONG_FIELD_MAX = 256 * 1024;

export const BROWSER_SITES = ['x', 'instagram', 'telegram'];

export const BROWSER_LOGIN_URLS: Record<string, string> = {
    x: 'https://x.com/i/flow/login',
    instagram: 'https://www.instagram.com/accounts/login/',
    telegram: 'https://web.telegram.org/k/',
};

export const BROWSER_QUEUE = new Map<string, Promise<void>>();

export const BROWSER_LAST_POST = new Map<number, number>();

export const BROWSER_POST_GAP = 120_000;

export const BROWSER_TIMEOUT = 150_000;

export const BROWSER_STEP_TIMEOUT = 30_000;

export const BROWSER_IMAGE_MAX = 8 * 1024 * 1024;

export const FILE_MAX_BYTES = 20 * 1024 * 1024;

export const FILE_TEXT_MAX = 20_000;

export const FILE_TIMEOUT = 60_000;

export const TRANSCRIBE_TIMEOUT = 120_000;

export const ATTACHMENT_TOKENS = 1500;

export const TEXT_FILE_PATTERN =
    /^text\/|^application\/(json|xml|x-yaml|yaml|csv|x-sh|javascript|typescript|sql)$|\.(txt|md|markdown|csv|tsv|json|xml|ya?ml|log|ini|toml|html?|css|js|ts|py|sql|sh)$/i;

export const PLUGIN_EVENTS = ['message.received', 'agent.replied', 'agent.action', 'agent.failed'];

export const PLUGIN_STATUS = new Map<number, { listening: boolean; error: string }>();

export const PLUGIN_NAME_MAX = 64;

export const PLUGIN_FIELD_MAX = 512;

export const PLUGIN_URL_MAX = 512;

export const PLUGIN_TEXT_MAX = 4000;

export const PLUGIN_ERROR_MAX = 240;

export const PLUGIN_CALL_PAGE = 30;

export const PLUGIN_TIMEOUT = 15_000;

export const PLUGIN_HISTORY = 10;

export const PLUGIN_LINKS_MAX = 40;

export const PLUGIN_PUBLISH_WAIT = 5_000;

export const PLUGIN_PUBLISH_TRIES = 12;

export const PLUGIN_READ_MAX = 50;

export const PLUGIN_HOOK_RATE = 120;

export const PLUGIN_HOOK_WINDOW = 60_000;

export const DISCORD_API = 'https://discord.com/api/v10';

export const DISCORD_GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';

export const DISCORD_INTENTS = (1 << 0) | (1 << 9) | (1 << 12);

export const DISCORD_TEXT_MAX = 2000;

export const DISCORD_HEARTBEAT = 41_250;

export const DISCORD_FATAL_CLOSE = [4004, 4010, 4011, 4012, 4013, 4014];

export const INSTAGRAM_API = 'https://graph.instagram.com/v25.0';

export const INSTAGRAM_CAPTION_MAX = 2200;

export const INSTAGRAM_MESSAGE_MAX = 1000;

export const INSTAGRAM_USER_IDS = new Map<string, string>();

export const TELEGRAM_CHAT_FIELD = {
    type: 'string',
    description: '@channelname or a numeric chat id; defaults to the plugin default chat',
};

export const DISCORD_CHANNEL_FIELD = {
    type: 'string',
    description: 'Channel id; defaults to the plugin default channel',
};

export const PLUGIN_TOOLS: ToolDefinition[] = [
    {
        name: 'browser_post',
        description:
            'Publish a post on X, Instagram or Telegram through a browser signed in as the account. Instagram needs an image. Posts from one account must be at least two minutes apart. Report exactly what was posted, or the error.',
        permission: 'plugin:poster',
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The text of the post' },
                image_url: {
                    type: 'string',
                    description: 'Optional public https address of an image to attach',
                },
            },
            required: ['text'],
        },
    },
    {
        name: 'telegram_send_message',
        description:
            'Send a message through a connected Telegram bot: a post to a channel, a message to a group, or to a person who has written to the bot. Markdown is converted. Pass reply_to to answer a particular message.',
        permission: 'plugin:telegram',
        inputSchema: {
            type: 'object',
            properties: {
                chat: TELEGRAM_CHAT_FIELD,
                text: { type: 'string', description: 'The message; markdown is fine' },
                reply_to: { type: 'integer', description: 'Optional message_id to reply to' },
                silent: { type: 'boolean', description: 'Send without a notification sound' },
            },
            required: ['text'],
        },
    },
    {
        name: 'telegram_send_photo',
        description:
            'Post a picture with an optional caption through a connected Telegram bot. The picture must be at a public https address.',
        permission: 'plugin:telegram',
        inputSchema: {
            type: 'object',
            properties: {
                chat: TELEGRAM_CHAT_FIELD,
                photo_url: { type: 'string', description: 'Public https address of the picture' },
                caption: { type: 'string', description: 'Optional caption; markdown is fine' },
            },
            required: ['photo_url'],
        },
    },
    {
        name: 'telegram_send_poll',
        description: 'Post a poll through a connected Telegram bot.',
        permission: 'plugin:telegram',
        inputSchema: {
            type: 'object',
            properties: {
                chat: TELEGRAM_CHAT_FIELD,
                question: { type: 'string', description: 'The question' },
                options: {
                    type: 'array',
                    description: 'Between 2 and 10 answers',
                    items: { type: 'string' },
                },
                anonymous: { type: 'boolean', description: 'Hide who voted; defaults to true' },
            },
            required: ['question', 'options'],
        },
    },
    {
        name: 'telegram_edit_message',
        description: 'Change the text of a message the Telegram bot sent earlier.',
        permission: 'plugin:telegram',
        inputSchema: {
            type: 'object',
            properties: {
                chat: TELEGRAM_CHAT_FIELD,
                message_id: { type: 'integer', description: 'The message to change' },
                text: { type: 'string', description: 'The new text; markdown is fine' },
            },
            required: ['message_id', 'text'],
        },
    },
    {
        name: 'telegram_delete_message',
        description: 'Delete a message in a chat where the Telegram bot may delete it.',
        permission: 'plugin:telegram',
        inputSchema: {
            type: 'object',
            properties: {
                chat: TELEGRAM_CHAT_FIELD,
                message_id: { type: 'integer', description: 'The message to delete' },
            },
            required: ['message_id'],
        },
    },
    {
        name: 'telegram_pin_message',
        description: 'Pin a message in a chat where the Telegram bot is an admin.',
        permission: 'plugin:telegram',
        inputSchema: {
            type: 'object',
            properties: {
                chat: TELEGRAM_CHAT_FIELD,
                message_id: { type: 'integer', description: 'The message to pin' },
            },
            required: ['message_id'],
        },
    },
    {
        name: 'telegram_chat_info',
        description: 'Read the title, type, description and member count of a Telegram chat.',
        permission: 'plugin:telegram',
        inputSchema: {
            type: 'object',
            properties: { chat: TELEGRAM_CHAT_FIELD },
            required: [],
        },
    },
    {
        name: 'telegram_react',
        description:
            'React to a Telegram message with an emoji, like a like. Telegram accepts only its standard reaction emoji, such as 👍 ❤ 🔥 🎉 👏.',
        permission: 'plugin:telegram',
        inputSchema: {
            type: 'object',
            properties: {
                chat: TELEGRAM_CHAT_FIELD,
                message_id: { type: 'integer', description: 'The message to react to' },
                emoji: { type: 'string', description: 'One reaction emoji' },
            },
            required: ['message_id', 'emoji'],
        },
    },
    {
        name: 'x_post',
        description:
            'Publish a post on X from the connected account. Pass reply_to to reply to a post, or quote to quote one. At most 280 characters, links counting as 23.',
        permission: 'plugin:x',
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The post' },
                reply_to: { type: 'string', description: 'Optional id of the post to reply to' },
                quote: { type: 'string', description: 'Optional id of the post to quote' },
            },
            required: ['text'],
        },
    },
    {
        name: 'x_like',
        description: 'Like a post on X, or take the like back with undo.',
        permission: 'plugin:x',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: { type: 'string', description: 'The post' },
                undo: { type: 'boolean', description: 'true to unlike' },
            },
            required: ['post_id'],
        },
    },
    {
        name: 'x_repost',
        description: 'Repost a post on X, or undo the repost.',
        permission: 'plugin:x',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: { type: 'string', description: 'The post' },
                undo: { type: 'boolean', description: 'true to undo the repost' },
            },
            required: ['post_id'],
        },
    },
    {
        name: 'x_delete',
        description: 'Delete a post the connected X account made.',
        permission: 'plugin:x',
        inputSchema: {
            type: 'object',
            properties: { post_id: { type: 'string', description: 'The post to delete' } },
            required: ['post_id'],
        },
    },
    {
        name: 'x_read_post',
        description:
            'Read one post on X with its author, time and counts of likes, reposts and replies.',
        permission: 'plugin:x',
        inputSchema: {
            type: 'object',
            properties: { post_id: { type: 'string', description: 'The post' } },
            required: ['post_id'],
        },
    },
    {
        name: 'x_mentions',
        description:
            'The latest posts that mention the connected X account, newest first, to review and answer them.',
        permission: 'plugin:x',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'integer', description: 'How many, 5 to 100; defaults to 10' },
            },
            required: [],
        },
    },
    {
        name: 'x_my_posts',
        description:
            'The latest posts of the connected X account with their likes, reposts and replies, to see what it already said.',
        permission: 'plugin:x',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'integer', description: 'How many, 5 to 100; defaults to 10' },
            },
            required: [],
        },
    },
    {
        name: 'x_search',
        description:
            'Search posts on X from the last 7 days, e.g. "blockchain -is:retweet lang:en".',
        permission: 'plugin:x',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'An X search query' },
                limit: { type: 'integer', description: 'How many, 10 to 100; defaults to 10' },
            },
            required: ['query'],
        },
    },
    {
        name: 'discord_send_message',
        description:
            'Send a message to a Discord channel through a connected bot. Pass reply_to to reply to a particular message.',
        permission: 'plugin:discord',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: DISCORD_CHANNEL_FIELD,
                content: { type: 'string', description: 'The message; Discord markdown is fine' },
                reply_to: { type: 'string', description: 'Optional id of the message to reply to' },
            },
            required: ['content'],
        },
    },
    {
        name: 'discord_edit_message',
        description: 'Change a message the Discord bot sent earlier.',
        permission: 'plugin:discord',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: DISCORD_CHANNEL_FIELD,
                message_id: { type: 'string', description: 'The message to change' },
                content: { type: 'string', description: 'The new text' },
            },
            required: ['message_id', 'content'],
        },
    },
    {
        name: 'discord_delete_message',
        description: 'Delete a message in a Discord channel the bot may manage.',
        permission: 'plugin:discord',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: DISCORD_CHANNEL_FIELD,
                message_id: { type: 'string', description: 'The message to delete' },
            },
            required: ['message_id'],
        },
    },
    {
        name: 'discord_react',
        description: 'Add an emoji reaction to a Discord message.',
        permission: 'plugin:discord',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: DISCORD_CHANNEL_FIELD,
                message_id: { type: 'string', description: 'The message to react to' },
                emoji: { type: 'string', description: 'A unicode emoji' },
            },
            required: ['message_id', 'emoji'],
        },
    },
    {
        name: 'discord_create_thread',
        description:
            'Start a thread in a Discord channel, from a message when message_id is given.',
        permission: 'plugin:discord',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: DISCORD_CHANNEL_FIELD,
                name: { type: 'string', description: 'The thread title' },
                message_id: { type: 'string', description: 'Optional message to start it from' },
            },
            required: ['name'],
        },
    },
    {
        name: 'discord_read_messages',
        description:
            'Read the latest messages in a Discord channel, newest first. Message text needs the Message Content intent turned on for the bot.',
        permission: 'plugin:discord',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: DISCORD_CHANNEL_FIELD,
                limit: { type: 'integer', description: 'How many, up to 50; defaults to 20' },
            },
            required: [],
        },
    },
    {
        name: 'discord_list_channels',
        description:
            'List the servers the Discord bot is in and their text channels, with ids to use in the other discord tools.',
        permission: 'plugin:discord',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'instagram_publish',
        description:
            'Publish a post on the connected Instagram account: one picture (image_url), a reel (video_url) or a carousel (image_urls, 2 to 10). Media must be at public https addresses; pictures must be JPEG.',
        permission: 'plugin:instagram',
        inputSchema: {
            type: 'object',
            properties: {
                caption: { type: 'string', description: 'The caption, hashtags included' },
                image_url: { type: 'string', description: 'A single JPEG picture' },
                video_url: { type: 'string', description: 'A video, published as a reel' },
                image_urls: {
                    type: 'array',
                    description: 'Pictures for a carousel',
                    items: { type: 'string' },
                },
            },
            required: [],
        },
    },
    {
        name: 'instagram_list_media',
        description:
            'List the latest posts on the connected Instagram account with their ids, captions, likes and comment counts.',
        permission: 'plugin:instagram',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'integer', description: 'How many, up to 50; defaults to 10' },
            },
            required: [],
        },
    },
    {
        name: 'instagram_list_comments',
        description:
            'Read the comments on one Instagram post. Get media_id from instagram_list_media.',
        permission: 'plugin:instagram',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: { type: 'string', description: 'The post id' },
                limit: { type: 'integer', description: 'How many, up to 50; defaults to 20' },
            },
            required: ['media_id'],
        },
    },
    {
        name: 'instagram_reply_comment',
        description: 'Reply publicly to a comment on one of the account posts.',
        permission: 'plugin:instagram',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: { type: 'string', description: 'The comment to reply to' },
                message: { type: 'string', description: 'The reply' },
            },
            required: ['comment_id', 'message'],
        },
    },
    {
        name: 'instagram_comment',
        description:
            'Comment on one of the account posts. Instagram lets an account comment only on its own posts or where it is mentioned. Get media_id from instagram_list_media.',
        permission: 'plugin:instagram',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: { type: 'string', description: 'The post id' },
                message: { type: 'string', description: 'The comment' },
            },
            required: ['media_id', 'message'],
        },
    },
    {
        name: 'instagram_hide_comment',
        description: 'Hide a comment on one of the account posts, or show it again.',
        permission: 'plugin:instagram',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: { type: 'string', description: 'The comment' },
                hide: { type: 'boolean', description: 'false shows it again; defaults to true' },
            },
            required: ['comment_id'],
        },
    },
    {
        name: 'instagram_send_message',
        description:
            'Send a direct message to someone who has messaged the Instagram account in the last 24 hours.',
        permission: 'plugin:instagram',
        inputSchema: {
            type: 'object',
            properties: {
                recipient_id: { type: 'string', description: 'Their Instagram-scoped id' },
                text: { type: 'string', description: 'The message' },
            },
            required: ['recipient_id', 'text'],
        },
    },
    {
        name: 'instagram_profile',
        description:
            'Read the connected Instagram account: username, followers, following and number of posts.',
        permission: 'plugin:instagram',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'browser_search',
        description:
            'Search the web with the project browser. Returns titles, links and snippets; open a result with browser_open.',
        permission: 'plugin:browser',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to search for, in plain words' },
                topic: {
                    type: 'string',
                    description: 'news for recent events, general otherwise; defaults to general',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'browser_open',
        description:
            'Open a public web page and read it as text, with the links on it. Long pages come in parts: pass next_offset from the last call to read on.',
        permission: 'plugin:browser',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Full http or https address' },
                offset: { type: 'integer', description: 'Where to continue reading' },
            },
            required: ['url'],
        },
    },
    {
        name: 'webhook_send',
        description:
            'Send an event to the address the webhook plugin points at, such as an automation in n8n, Zapier or Make.',
        permission: 'plugin:webhook',
        inputSchema: {
            type: 'object',
            properties: {
                event: { type: 'string', description: 'A short event name, e.g. lead.created' },
                text: { type: 'string', description: 'A human-readable summary' },
                data: { type: 'object', description: 'Any structured details to include' },
            },
            required: [],
        },
    },
];

export const PLUGIN_KINDS: PluginKind[] = [
    {
        key: 'telegram',
        label: 'Telegram',
        description:
            'Post to channels and groups, send photos and polls, reply to, edit, pin and delete messages through a bot. It can also answer people who write to the bot.',
        inbound: 'listen',
        inbound_hint:
            'Answers private messages, and in groups messages that mention the bot or reply to it. A bot already added under Bots answers from there instead.',
        fields: [
            {
                key: 'token',
                label: 'Bot token',
                secret: true,
                required: true,
                hint: 'From @BotFather. Make the bot an admin of a channel for it to post there.',
                placeholder: '123456789:AA...',
            },
            {
                key: 'default_chat',
                label: 'Default chat',
                secret: false,
                required: false,
                hint: 'Used when the agent does not name one: @channelname or a chat id.',
                placeholder: '@mychannel',
            },
        ],
    },
    {
        key: 'relay',
        label: 'Channel relay',
        description:
            'Watches a Telegram channel and, for every new post, has an agent rewrite it to your brief and posts the result to a group.',
        inbound: 'listen',
        inbound_hint:
            'This agent rewrites each new post. With the bot as an admin of the channel, posts arrive at once; otherwise the channel must be public, and its page is read every two minutes.',
        fields: [
            {
                key: 'token',
                label: 'Bot token',
                secret: true,
                required: true,
                hint: 'From @BotFather. Add the bot to the group it posts in. Use a bot that is not also under Bots or another plugin.',
                placeholder: '123456789:AA...',
            },
            {
                key: 'source',
                label: 'Channel to watch',
                secret: false,
                required: true,
                hint: '@channelname or its t.me link. For a private channel, make the bot an admin and give the channel id.',
                placeholder: '@newschannel',
            },
            {
                key: 'target',
                label: 'Group to post in',
                secret: false,
                required: true,
                hint: 'The group id, such as -1001234567890, or @groupname for a public group.',
                placeholder: '-1001234567890',
            },
            {
                key: 'brief',
                label: 'How to rewrite',
                secret: false,
                required: true,
                hint: 'What the agent does with every post, for example which project to tie it to and how long to keep it.',
                placeholder:
                    'Relate it to NuraChain and write it for our community, in the same language.',
            },
        ],
    },
    {
        key: 'voice',
        label: 'Speech to text',
        description:
            'Turns voice messages people send your bots into text, so the agent can act on what they said. Works with any OpenAI-compatible transcription service, such as OpenAI or Groq.',
        inbound: 'none',
        inbound_hint: '',
        fields: [
            {
                key: 'base_url',
                label: 'Service address',
                secret: false,
                required: true,
                format: 'url',
                hint: 'OpenAI: https://api.openai.com/v1. Groq: https://api.groq.com/openai/v1.',
                placeholder: 'https://api.openai.com/v1',
            },
            {
                key: 'api_key',
                label: 'API key',
                secret: true,
                required: true,
                hint: 'The key for that service.',
                placeholder: 'sk-...',
            },
            {
                key: 'model',
                label: 'Model',
                secret: false,
                required: true,
                hint: 'OpenAI: whisper-1 or gpt-4o-mini-transcribe. Groq: whisper-large-v3-turbo.',
                placeholder: 'whisper-1',
            },
            {
                key: 'language',
                label: 'Language',
                secret: false,
                required: false,
                hint: 'Optional: a two-letter code such as fa or en when everyone speaks one language. Leave it empty to detect the language.',
                placeholder: 'fa',
            },
        ],
    },
    {
        key: 'poster',
        label: 'Browser posting',
        description:
            'Posts to X, Instagram or Telegram through a real browser signed in as your account, for accounts without API access. The sites may block accounts they see as automated, so post sparingly.',
        inbound: 'none',
        inbound_hint: '',
        fields: [
            {
                key: 'site',
                label: 'Site',
                secret: false,
                required: true,
                hint: 'x, instagram or telegram.',
                placeholder: 'x',
            },
            {
                key: 'session',
                label: 'Signed-in session',
                secret: true,
                required: true,
                long: true,
                hint: 'On a computer with a screen, run npm run browser:login -- x (or instagram, telegram), sign in, then paste the file it saves here and delete that file.',
                placeholder: '{"cookies":[...],"origins":[...]}',
            },
            {
                key: 'chat',
                label: 'Telegram chat',
                secret: false,
                required: false,
                hint: 'For Telegram only: the channel or group to post in, such as @mychannel.',
                placeholder: '@mychannel',
            },
        ],
    },
    {
        key: 'x',
        label: 'X',
        description:
            'Post, reply, quote, like, repost and delete on X, and read mentions, searches and posts. Every request spends X API credits.',
        inbound: 'none',
        inbound_hint: '',
        fields: [
            {
                key: 'api_key',
                label: 'API key',
                secret: true,
                required: true,
                hint: 'X developer console, your app, Keys and tokens: the consumer key.',
                placeholder: '',
            },
            {
                key: 'api_secret',
                label: 'API key secret',
                secret: true,
                required: true,
                hint: 'Shown next to the API key.',
                placeholder: '',
            },
            {
                key: 'access_token',
                label: 'Access token',
                secret: true,
                required: true,
                hint: 'Set the app to Read and write first, then generate it for the account that posts.',
                placeholder: '',
            },
            {
                key: 'access_secret',
                label: 'Access token secret',
                secret: true,
                required: true,
                hint: 'Shown with the access token.',
                placeholder: '',
            },
        ],
    },
    {
        key: 'discord',
        label: 'Discord',
        description:
            'Post, reply, react, edit, delete and start threads in Discord channels, and read what was said there. It can also answer mentions and direct messages.',
        inbound: 'listen',
        inbound_hint:
            'Answers direct messages and messages that mention the bot. Reading channel history needs the Message Content intent on in the Discord developer portal.',
        fields: [
            {
                key: 'token',
                label: 'Bot token',
                secret: true,
                required: true,
                hint: 'Discord developer portal, Bot, Reset Token. Invite the bot with the Send Messages permission.',
                placeholder: 'MTE...',
            },
            {
                key: 'default_channel',
                label: 'Default channel id',
                secret: false,
                required: false,
                format: 'numeric',
                hint: 'Used when the agent does not name one. With developer mode on, right-click a channel and Copy ID.',
                placeholder: '112233445566778899',
            },
        ],
    },
    {
        key: 'instagram',
        label: 'Instagram',
        description:
            'Publish pictures, reels and carousels, read, answer and hide comments, and reply to direct messages on a professional account.',
        inbound: 'webhook',
        inbound_hint:
            'In the Meta app dashboard, point the Instagram webhook at the address below with the verify token, and subscribe to comments and messages. The app secret is required to trust what arrives.',
        fields: [
            {
                key: 'token',
                label: 'Access token',
                secret: true,
                required: true,
                hint: 'An Instagram user access token from the Meta app dashboard, with content publishing, comments and messages permissions.',
                placeholder: 'IGAA...',
            },
            {
                key: 'app_secret',
                label: 'App secret',
                secret: true,
                required: false,
                hint: 'Needed only to answer comments and messages: it proves a webhook call came from Meta.',
                placeholder: '',
            },
        ],
    },
    {
        key: 'browser',
        label: 'Web browser',
        description:
            'Search the web and read pages in parts with their links, from the server. Private and internal addresses are always refused.',
        inbound: 'none',
        inbound_hint: '',
        fields: [
            {
                key: 'tavily_key',
                label: 'Tavily API key',
                secret: true,
                required: false,
                hint: 'Optional, free at tavily.com. Without one, search falls back to Bing, DuckDuckGo and Wikipedia, which are less reliable.',
                placeholder: 'tvly-...',
            },
            {
                key: 'blocked_domains',
                label: 'Blocked sites',
                secret: false,
                required: false,
                hint: 'Comma separated. These and their subdomains are never searched or opened.',
                placeholder: 'example.com, ads.example.net',
            },
        ],
    },
    {
        key: 'webhook',
        label: 'Webhook',
        description:
            'Send events to any address, such as n8n, Zapier or Make, and let other systems ask an agent something by calling this project.',
        inbound: 'webhook',
        inbound_hint:
            'POST JSON with a text field to the address below, with the secret in an x-nura-secret header. The reply comes back in the response.',
        fields: [
            {
                key: 'url',
                label: 'Send to',
                secret: false,
                required: true,
                format: 'url',
                hint: 'Where webhook_send posts. Each request is signed with the secret below in x-nura-signature.',
                placeholder: 'https://hooks.example.com/nura',
            },
            {
                key: 'authorization',
                label: 'Authorization header',
                secret: true,
                required: false,
                hint: 'Optional, sent as-is with every request, e.g. Bearer abc123.',
                placeholder: 'Bearer ...',
            },
        ],
    },
];

export const X_API = 'https://api.x.com/2';

export const X_TEXT_MAX = 280;

export const X_URL_WEIGHT = 23;

export const X_LIGHT_RANGES: [number, number][] = [
    [0x0000, 0x10ff],
    [0x2000, 0x200d],
    [0x2010, 0x201f],
    [0x2032, 0x2037],
];

export const X_USER_IDS = new Map<string, string>();

export const X_POST_FIELDS = {
    'tweet.fields': 'created_at,public_metrics,author_id,conversation_id',
    expansions: 'author_id',
    'user.fields': 'username',
};
