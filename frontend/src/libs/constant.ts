import type { LucideIcon } from 'lucide-react';
import {
    Bot,
    Cpu,
    FileText,
    LayoutGrid,
    ListChecks,
    MessageSquare,
    Settings2,
    ShieldCheck,
    Users,
    Wrench,
} from 'lucide-react';

import type { AuditEntry } from '@/apis/audit';
import type { ProviderPreset } from '@/apis/model';

export const API_BASE_URL = '/api';

export const ACCESS_TOKEN_KEY = 'accessToken';

export const TOKENS_PER_CHARACTER = 4;

export const CONFIRM_TIMEOUT = 4000;

export const METRICS_REFRESH = 10_000;

export const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

// A model set to this uses a free OpenRouter model for each reply and moves to the next one
// when a model is busy or fails. The backend stores and recognises the same value.
export const MODEL_AUTO_FREE = 'auto:free';

// How long the model form waits after the address or key stops changing before it lists models.
export const MODEL_LIST_DELAY = 500;

export const PAGE_WIDTH = 'mx-auto w-full max-w-5xl';

export const TEAM_NAMES = new Map<number, string>();

export const DESTINATIONS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: '', label: 'Overview', icon: LayoutGrid },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'bots', label: 'Bots', icon: MessageSquare },
    { id: 'models', label: 'Models', icon: Cpu },
    { id: 'tasks', label: 'Tasks', icon: ListChecks },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'tools', label: 'MCP', icon: Wrench },
    { id: 'settings', label: 'Settings', icon: Settings2 },
];

// The team.json capabilities the Team page offers per agent, one per tool.
export const ROSTER_ACCESS = [
    { key: 'roster.read', label: 'Reads it' },
    { key: 'roster.create', label: 'Adds members' },
    { key: 'roster.update', label: 'Updates members' },
    { key: 'roster.delete', label: 'Removes members' },
];

// Networks offered when recording where a team member can be found; any other name works too.
export const SOCIAL_NETWORKS = [
    'telegram',
    'x',
    'instagram',
    'linkedin',
    'github',
    'website',
    'email',
];

// What the Team page says for each refusal the roster endpoints can give.
export const ROSTER_ERRORS: Record<string, string> = {
    ROSTER_MEMBER_TAKEN: 'Someone with that name is already on the team.',
    ROSTER_MEMBER_NOT_FOUND: 'That person is no longer on the team.',
    ROSTER_FULL: 'team.json already holds as many people as it can.',
    ROSTER_TOO_LARGE: 'team.json would grow past its size limit. Shorten a description.',
    ROSTER_INVALID: 'That member could not be saved. Check the name.',
    ROSTER_MALFORMED: 'team.json is damaged and cannot be read.',
};

// How often a task repeats, as the task form and cards name it.
export const TASK_REPEAT_LABELS: Record<string, string> = {
    none: 'Once',
    daily: 'Every day',
    weekly: 'Every week',
};

// A task's state as its card shows it: the words, and the badge that carries them.
export const TASK_STATUS: Record<
    string,
    { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
    scheduled: { label: 'Scheduled', variant: 'secondary' },
    running: { label: 'Running', variant: 'default' },
    done: { label: 'Done', variant: 'outline' },
    failed: { label: 'Failed', variant: 'destructive' },
    cancelled: { label: 'Cancelled', variant: 'outline' },
};

// How often an open run log asks for news while a task is running.
export const TASK_LIVE_POLL = 1500;

// What the Tasks page says for each refusal the task endpoints can give.
export const TASK_ERRORS: Record<string, string> = {
    TASK_TITLE_REQUIRED: 'Give the task a title.',
    TASK_AGENT_REQUIRED: 'Pick the agent that carries it out.',
    TASK_AGENT_NOT_FOUND: 'That agent is no longer in this project.',
    TASK_PROFILE_NOT_FOUND: 'That person is no longer in this project.',
    TASK_START_INVALID: 'Pick when it should run.',
    TASK_RUNNING: 'It is running right now. Try again when it finishes.',
    TASK_CANCELLED: 'It is cancelled. Schedule it again to run it.',
};

// How long the person picker waits after typing stops before it searches.
export const PROFILE_SEARCH_DELAY = 300;

// The agent page's tabs, in order; the first is the one it opens on.
export const AGENT_TABS = [
    { value: 'settings', label: 'Settings', icon: Settings2 },
    { value: 'capabilities', label: 'Capabilities', icon: ShieldCheck },
    { value: 'files', label: 'Files', icon: FileText },
] as const;

export type AgentTab = (typeof AGENT_TABS)[number]['value'];

export const TEAM_TITLES: Record<string, { title: string; description: string }> = {
    '': { title: 'Overview', description: 'How this project is running right now.' },
    overview: { title: 'Overview', description: 'How this project is running right now.' },
    agents: { title: 'Agents', description: 'The roles that answer, and the models behind them.' },
    bots: { title: 'Bots', description: 'The bots people message, and who has messaged them.' },
    models: { title: 'Models', description: 'The endpoints this project can call.' },
    tasks: {
        title: 'Tasks',
        description: 'Work the agents carry out at a set time, and what came of each run.',
    },
    team: {
        title: 'Team',
        description: 'The people on this team, kept in team.json for the agents to answer from.',
    },
    tools: {
        title: 'MCP tools',
        description:
            'The tools agents can call, such as managing team.json, and which agents may call them.',
    },
    settings: { title: 'Settings', description: 'What this project is called.' },
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const HEAT_SCALE = ['bg-scale-0', 'bg-scale-1', 'bg-scale-2', 'bg-scale-3', 'bg-scale-4'];

// The failure heatmap: red is for failures only.
export const HEAT_SCALE_FAILED = [
    'bg-scale-0',
    'bg-scale-fail-1',
    'bg-scale-fail-2',
    'bg-scale-fail-3',
    'bg-scale-fail-4',
];

export const STATUS_FILL: Record<'live' | 'degraded' | 'off' | 'failed', string> = {
    live: 'bg-primary ring-3 ring-primary/15',
    degraded: 'bg-warning',
    off: 'bg-neutral',
    failed: 'bg-destructive',
};

export const AUDIT_RESULT: Record<AuditEntry['outcome'], { label: string; className: string }> = {
    ok: { label: 'OK', className: 'text-primary' },
    error: { label: 'Failed', className: 'text-destructive' },
    skipped: { label: 'Skipped', className: 'text-warning' },
};

export const PROBE_TONE: Record<string, string> = {
    ok: 'text-primary',
    pending: 'text-warning',
    error: 'text-destructive',
};

export const PROVIDER_FALLBACK: ProviderPreset[] = [
    {
        key: 'custom',
        label: 'Other OpenAI-compatible endpoint',
        url: '',
        catalog: false,
        key_required: false,
        models: [],
        hint: '',
    },
];

export const BLANK_MODEL = { name: '', model: '', baseUrl: '', apiKey: '', contextTokens: '' };

export const WALLET_DISCOVERY_TIMEOUT = 350;

export const WALLETS: { id: string; name: string; rdns: string; keyword: string; blurb: string }[] =
    [
        {
            id: 'nura',
            name: 'Nura Wallet',
            rdns: 'ai.nura.wallet',
            keyword: 'nura',
            blurb: 'Built for Nura, signs without leaving the app',
        },
        {
            id: 'metamask',
            name: 'MetaMask',
            rdns: 'io.metamask',
            keyword: 'metamask',
            blurb: 'The browser extension you may already have',
        },
    ];

export const LOGO_SRC = '/logo.png';

export const BRAND_SIZES: Record<'sm' | 'lg', string> = {
    sm: 'size-8 rounded-md',
    lg: 'size-12 rounded-lg',
};
