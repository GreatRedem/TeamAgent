import type { AgentPermission } from './routes/agent/agent.permission.js';
import type { AgentDocumentTemplate } from './routes/agent/agent.template.js';
import type { ExchangeUsage } from './routes/agent/agent.usage.js';
import type { ToolDefinition } from './routes/mcp/mcp.tools.js';
import type { CatalogModel, ProviderPreset } from './routes/model/model.provider.js';
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
        key: 'roster.read',
        label: 'May read the team file',
        description:
            'Lets this agent read team.json: who is on the team, what they do, their rank and their public handles.',
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
            'Lets this agent change what team.json says about someone already on it: their rank, description, handles or name. Only the fields it passes change.',
    },
    {
        key: 'roster.delete',
        label: 'May remove team members',
        description:
            'Lets this agent take a person out of team.json. The one team.json action that loses information, so grant it sparingly.',
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
        description:
            'Lets this agent know the current date and time. Harmless, and on by default for new agents.',
    },
];

export const AGENT_KNOWN = new Set(AGENT_PERMISSIONS.map((permission) => permission.key));

export const SPLIT: Record<string, string[]> = {
    'roster.write': ['roster.create', 'roster.update', 'roster.delete'],
};

export const DEFAULT_AGENT_PERMISSIONS: string[] = ['basics'];

export const AGENT_PERMISSIONS_MAX = 256;

export const MAX_TOOL_ROUNDS = 4;

export const HISTORY_LIMIT = 12;

export const TELEGRAM_TEXT_MAX = 4096;

export const MAX_COMPLETION_TOKENS = 2048;

export const ERROR_TEXT_MAX = 200;

export const DEFAULT_CONTEXT_TOKENS = 8192;

export const CONTEXT_MARGIN = 512;

export const MESSAGE_OVERHEAD = 4;

export const MIN_INPUT_BUDGET = 512;

export const ALWAYS_INLINE = ['instructions.md', 'guardrails.md'];

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

export const HEATMAP_DAYS = 364;

export const LIST_LIMIT = 60;

export const FILE_PAGE = 20;

export const MCP_DOCUMENT_CONTENT_MAX = 16384;

export const PREFERENCES_TEMPLATE = `# Preferences

What this person wants remembered between conversations.

- (nothing recorded yet)
`;

export const PERSONAL_TOOLS = [
    'preferences_list',
    'preferences_read',
    'preferences_write',
    'preferences_append',
    'profile_get',
    'conversation_search',
];

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
        name: 'time_now',
        description:
            'The current date and time in UTC. Use this rather than guessing what day it is.',
        permission: 'basics',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'roster_read',
        description:
            'Read team.json: the people on this team with their rank, description and public handles. Use it before answering questions about who someone is or what they do.',
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
                rank: {
                    type: 'string',
                    description: 'Their role or rank on the team, e.g. founder, engineer',
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
            'Change what team.json says about someone already on it. Only the fields you pass change, so you can set a rank without touching a description; handles are merged with those recorded. Pass new_name to rename them. Use roster_read first when you need to know what is there.',
        permission: 'roster.update',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Who to update, by their current name' },
                new_name: { type: 'string', description: 'Optional: a new name for them' },
                rank: { type: 'string', description: 'Their role or rank on the team' },
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

export const TASK_REPEATS = ['none', 'daily', 'weekly'] as const;

export const TASK_STATUSES = ['scheduled', 'running', 'done', 'failed', 'cancelled'] as const;

export const TITLE_MAX = 120;

export const TASK_DESCRIPTION_MAX = 4000;

export const GOAL_MAX = 2000;

export const PERIOD: Record<TaskRepeat, number> = {
    none: 0,
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

export const ROSTER_INLINE_MAX = 8000;

export const FORM_FIELDS = ['name', 'rank', 'description', 'social', 'profile_id'];

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
