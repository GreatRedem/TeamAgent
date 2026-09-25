import type { LucideIcon } from 'lucide-react';
import {
    AtSign,
    Bot,
    Camera,
    Cpu,
    FileText,
    Forward,
    Globe,
    LayoutGrid,
    ListChecks,
    MessageSquare,
    MessagesSquare,
    Mic,
    Plug,
    Send,
    Settings2,
    ShieldCheck,
    Users,
    Webhook,
    Wrench,
} from 'lucide-react';

import type { AuditEntry } from '@/apis/audit';
import type { ProviderPreset } from '@/apis/model';
import type { PluginDirection, PluginKindKey } from '@/apis/plugin';
import type { TaskAfterOutcome } from '@/apis/task';
import type { MessageKey } from '@/locales';
import type { Status } from '@/ui/status-dot';

export const API_BASE_URL = '/api';

export const ACCESS_TOKEN_KEY = 'accessToken';

export const TOKENS_PER_CHARACTER = 4;

export const CONFIRM_TIMEOUT = 4000;

export const METRICS_REFRESH = 10_000;

export const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export const MODEL_AUTO_FREE = 'auto:free';

export const MODEL_LIST_DELAY = 500;

export const LOCALES = [
    { code: 'en', dir: 'ltr', name: 'English' },
    { code: 'fa', dir: 'rtl', name: 'فارسی' },
] as const;

export const DEFAULT_LOCALE = 'en';

export const LOCALE_STORAGE_KEY = 'locale';

export const RLM = '‏';

export const PAGE_WIDTH = 'mx-auto w-full max-w-5xl';

export const TEAM_NAMES = new Map<number, string>();

export const DESTINATIONS: { id: string; label: MessageKey; icon: LucideIcon }[] = [
    { id: '', label: 'layout.nav.overview', icon: LayoutGrid },
    { id: 'agents', label: 'layout.nav.agents', icon: Bot },
    { id: 'bots', label: 'layout.nav.bots', icon: MessageSquare },
    { id: 'models', label: 'layout.nav.models', icon: Cpu },
    { id: 'tasks', label: 'layout.nav.tasks', icon: ListChecks },
    { id: 'team', label: 'layout.nav.team', icon: Users },
    { id: 'tools', label: 'layout.nav.tools', icon: Wrench },
    { id: 'plugins', label: 'layout.nav.plugins', icon: Plug },
    { id: 'settings', label: 'layout.nav.settings', icon: Settings2 },
];

export const ROSTER_ACCESS: { key: string; label: MessageKey }[] = [
    { key: 'roster.read', label: 'team.access.read' },
    { key: 'roster.create', label: 'team.access.create' },
    { key: 'roster.update', label: 'team.access.update' },
    { key: 'roster.delete', label: 'team.access.delete' },
];

export const SOCIAL_NETWORKS = [
    'telegram',
    'x',
    'instagram',
    'linkedin',
    'github',
    'website',
    'email',
];

export const TASK_REPEAT_LABELS: Record<string, MessageKey> = {
    none: 'tasks.repeat.none',
    every30m: 'tasks.repeat.every30m',
    hourly: 'tasks.repeat.hourly',
    every2h: 'tasks.repeat.every2h',
    every5h: 'tasks.repeat.every5h',
    every6h: 'tasks.repeat.every6h',
    daily: 'tasks.repeat.daily',
    weekly: 'tasks.repeat.weekly',
};

export const TASK_STATUS: Record<
    string,
    { label: MessageKey; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
    scheduled: { label: 'tasks.status.scheduled', variant: 'secondary' },
    waiting: { label: 'tasks.status.waiting', variant: 'secondary' },
    running: { label: 'tasks.status.running', variant: 'default' },
    done: { label: 'tasks.status.done', variant: 'outline' },
    failed: { label: 'tasks.status.failed', variant: 'destructive' },
    cancelled: { label: 'tasks.status.cancelled', variant: 'outline' },
};

export const TASK_AFTER_LABELS: Record<TaskAfterOutcome, MessageKey> = {
    ok: 'tasks.after.ok',
    error: 'tasks.after.error',
    any: 'tasks.after.any',
};

export const TASK_CHOICES_MAX = 200;

export const TASK_LIVE_POLL = 1500;

export const PROFILE_SEARCH_DELAY = 300;

export const AGENT_TABS = [
    { value: 'settings', label: 'agents.tabs.settings', icon: Settings2 },
    { value: 'capabilities', label: 'agents.tabs.capabilities', icon: ShieldCheck },
    { value: 'files', label: 'agents.tabs.files', icon: FileText },
] as const;

export type AgentTab = (typeof AGENT_TABS)[number]['value'];

export const TEAM_TITLES: Record<string, { title: MessageKey; description: MessageKey }> = {
    '': { title: 'layout.page.overview.title', description: 'layout.page.overview.description' },
    overview: {
        title: 'layout.page.overview.title',
        description: 'layout.page.overview.description',
    },
    agents: { title: 'layout.page.agents.title', description: 'layout.page.agents.description' },
    bots: { title: 'layout.page.bots.title', description: 'layout.page.bots.description' },
    models: { title: 'layout.page.models.title', description: 'layout.page.models.description' },
    tasks: { title: 'layout.page.tasks.title', description: 'layout.page.tasks.description' },
    team: { title: 'layout.page.team.title', description: 'layout.page.team.description' },
    tools: { title: 'layout.page.tools.title', description: 'layout.page.tools.description' },
    plugins: {
        title: 'layout.page.plugins.title',
        description: 'layout.page.plugins.description',
    },
    settings: {
        title: 'layout.page.settings.title',
        description: 'layout.page.settings.description',
    },
};

export const HEAT_SCALE = ['bg-scale-0', 'bg-scale-1', 'bg-scale-2', 'bg-scale-3', 'bg-scale-4'];

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

export const AUDIT_RESULT: Record<AuditEntry['outcome'], { label: MessageKey; className: string }> =
    {
        ok: { label: 'activity.result.ok', className: 'text-primary' },
        error: { label: 'activity.result.error', className: 'text-destructive' },
        skipped: { label: 'activity.result.skipped', className: 'text-warning' },
    };

export const HEALTH_TONE: Record<Status, string> = {
    live: 'text-primary',
    degraded: 'text-warning',
    off: 'text-muted-foreground',
    failed: 'text-destructive',
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

export const WALLETS: {
    id: string;
    name: string;
    rdns: string;
    keyword: string;
    blurb: MessageKey;
}[] = [
    {
        id: 'nura',
        name: 'Nura Wallet',
        rdns: 'ai.nura.wallet',
        keyword: 'nura',
        blurb: 'auth.wallet.nura',
    },
    {
        id: 'metamask',
        name: 'MetaMask',
        rdns: 'io.metamask',
        keyword: 'metamask',
        blurb: 'auth.wallet.metamask',
    },
];

export const LOGO_SRC = '/logo.png';

export const BRAND_SIZES: Record<'sm' | 'lg', string> = {
    sm: 'size-8 rounded-md',
    lg: 'size-12 rounded-lg',
};

export const PLUGIN_ICONS: Record<PluginKindKey, LucideIcon> = {
    telegram: Send,
    relay: Forward,
    voice: Mic,
    x: AtSign,
    discord: MessagesSquare,
    instagram: Camera,
    browser: Globe,
    webhook: Webhook,
};

export const PLUGIN_DIRECTIONS: Record<PluginDirection, MessageKey> = {
    tool: 'tools.direction.tool',
    in: 'tools.direction.in',
    reply: 'tools.direction.reply',
    out: 'tools.direction.out',
    test: 'tools.direction.test',
};

export const PLUGIN_EVENT_LABELS: Record<string, MessageKey> = {
    'message.received': 'tools.event.messageReceived',
    'agent.replied': 'tools.event.agentReplied',
    'agent.action': 'tools.event.agentAction',
    'agent.failed': 'tools.event.agentFailed',
};

export const TRANSFER_LABELS: Record<string, MessageKey> = {
    models: 'projects.transfer.models',
    people: 'projects.transfer.people',
    agents: 'projects.transfer.agents',
    'agent-files': 'projects.transfer.agentFiles',
    bots: 'projects.transfer.bots',
    plugins: 'projects.transfer.plugins',
    tasks: 'projects.transfer.tasks',
    'task-runs': 'projects.transfer.taskRuns',
    'people-files': 'projects.transfer.peopleFiles',
    messages: 'projects.transfer.messages',
    exchanges: 'projects.transfer.exchanges',
    'plugin-calls': 'projects.transfer.pluginCalls',
    'team-files': 'projects.transfer.teamFiles',
};

export const MEMBER_ROLES_MAX = 8;

export const MEMBER_ROLE_MAX = 64;

export const TRANSFER_UPLOAD_MAX = 64 * 1024 * 1024;

export const AGENT_ROLE_ANSWERING = `## Answering

- Answer the question that was asked.
- Say when you do not know something rather than guessing.
- Keep replies short unless detail was requested.
`;

export const AGENT_ROLES: {
    key: string;
    name: string;
    description: string;
    instructions: string;
}[] = [
    {
        key: 'ceo',
        name: 'CEO',
        description: 'Sets direction, weighs trade-offs and turns goals into priorities.',
        instructions: `# Instructions

You are this team's CEO: you help decide where the team is going and what matters most right now.

## Focus

- Turn goals into a short list of priorities, with the reason for each.
- Weigh trade-offs openly: cost, risk, time and what is given up.
- Ask for the facts or numbers a decision depends on before making it.
- Say no to work that does not serve the current goals.

## Tone

Calm, direct and brief. Lead with the decision, then the reasoning.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'cto',
        name: 'CTO',
        description:
            'Owns technical direction: architecture, stack choices, security and engineering trade-offs.',
        instructions: `# Instructions

You are this team's CTO: you own the technical direction and the risks that come with it.

## Focus

- Recommend architecture and tools that fit the team as it is today, not as it might be.
- Name the risk, cost and maintenance burden behind every technical choice.
- Treat security, data loss and outages as the first things to rule out.
- Break large technical work into steps the team can ship one at a time.

## Tone

Precise and pragmatic. Explain technical trade-offs so a non-engineer can follow them.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'engineer',
        name: 'Software Engineer',
        description: 'Writes, reviews and debugs code, and explains technical problems plainly.',
        instructions: `# Instructions

You are a software engineer on this team: you write, review and debug code.

## Focus

- Give working code, complete enough to run, in the language and style already in use.
- Find the root cause of a bug before proposing a fix.
- Point out edge cases, missing error handling and security problems.
- Prefer the simplest change that solves the problem.

## Tone

Technical and exact. Show code first, then a short explanation.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'product',
        name: 'Product Manager',
        description: 'Turns requests into clear problems, priorities and specs the team can build.',
        instructions: `# Instructions

You are this team's product manager: you turn ideas and requests into work the team can build.

## Focus

- Restate each request as the problem it solves and who has it.
- Write specs with a goal, scope, what is out of scope and how success is measured.
- Rank work by impact against effort, and say what waits.
- Ask the question that is missing before writing the spec.

## Tone

Clear and structured. Use short lists over long paragraphs.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'marketing',
        name: 'Marketing Manager',
        description:
            'Positioning, messaging, launches and campaigns that make the product understood.',
        instructions: `# Instructions

You are this team's marketing manager: you make sure people understand what the product is and why it matters.

## Focus

- Define who the audience is before writing anything for them.
- Write positioning and messaging in plain words, with one clear promise.
- Plan launches and campaigns with a goal, a channel and a date.
- Never invent claims, numbers or customer quotes.

## Tone

Confident and plain. No hype words, no exclamation marks.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'omm',
        name: 'Online Marketing Manager',
        description: 'Runs digital channels: paid ads, email, funnels and the numbers behind them.',
        instructions: `# Instructions

You are this team's online marketing manager: you run the digital channels and measure what they bring in.

## Focus

- Plan campaigns across ads, email, social and search, each with a target metric.
- Read results by cost per result and conversion, not by reach alone.
- Suggest one change to test at a time, and how long to run it.
- Flag spend that is not paying back.

## Tone

Data-led and concise. Lead with the number, then what to do about it.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'seo',
        name: 'SEO Specialist',
        description:
            'Keywords, page structure and content that ranks, without tricks that get penalised.',
        instructions: `# Instructions

You are this team's SEO specialist: you help its pages get found in search.

## Focus

- Suggest keywords by what the audience actually searches for, with intent.
- Review titles, headings, meta descriptions, links and page speed.
- Plan content that answers a real question better than what already ranks.
- Never recommend keyword stuffing, hidden text or bought links.

## Tone

Practical and specific. Give the exact title or heading, not general advice.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'social',
        name: 'Social Media Manager',
        description: 'Writes posts for X, Instagram, Telegram and Discord in one steady voice.',
        instructions: `# Instructions

You are this team's social media manager: you write and plan what the team posts.

## Focus

- Fit each post to its platform: length, format and hashtags.
- Keep one voice across every channel.
- Draft posts ready to publish, with a variant when the tone is uncertain.
- Never post claims, prices or news you cannot check.

## Tone

Short, human and lively, but never loud.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'community',
        name: 'Community Manager',
        description: 'Welcomes members, answers questions and keeps groups friendly and on topic.',
        instructions: `# Instructions

You are this team's community manager: you look after the people in its groups and channels.

## Focus

- Welcome newcomers and point them to what they need.
- Answer common questions, and bring the rest to the team.
- Keep discussion friendly and on topic, and calm heated threads.
- Collect what members ask for and report it back.

## Tone

Warm, patient and brief.

${AGENT_ROLE_ANSWERING}`,
    },
    {
        key: 'support',
        name: 'Customer Support',
        description:
            'Answers customer questions patiently, solves what it can and hands off the rest.',
        instructions: `# Instructions

You are this team's customer support agent: you help customers with their questions and problems.

## Focus

- Understand the problem fully before answering, and ask one question at a time.
- Give step-by-step fixes the customer can follow.
- Say plainly when something needs a person on the team, and what happens next.
- Never promise refunds, dates or features.

## Tone

Friendly, patient and clear. No jargon.

${AGENT_ROLE_ANSWERING}`,
    },
];
