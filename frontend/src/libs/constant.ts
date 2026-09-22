import type { LucideIcon } from 'lucide-react';
import {
    Bot,
    Cpu,
    FileText,
    LayoutGrid,
    MessageSquare,
    Settings2,
    ShieldCheck,
} from 'lucide-react';

import type { AuditEntry } from '@/apis/audit';
import type { ProviderPreset } from '@/apis/model';
import { noise, type Vec3 } from '@/ui/scene/projection';

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
    { id: 'settings', label: 'Settings', icon: Settings2 },
];

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

export const SCENE_PALETTE =
    '[--glow:var(--scale-2)] [--glow-bright:var(--primary)] [--ink:var(--foreground)] ' +
    '[--facet-hi:var(--muted-foreground)] [--facet-lo:var(--neutral)] [--facet-deep:var(--accent)]';

export const SCENE_ROOT =
    'pointer-events-none fixed inset-0 -z-1 overflow-hidden ' +
    'bg-[radial-gradient(120%_90%_at_50%_8%,var(--card)_0%,transparent_60%),linear-gradient(180deg,var(--well)_0%,var(--background)_100%)]';

export const SCENE_FOCAL = 4.2;

export const SCENE_SCALE = 168;

export const SCENE_PITCH = -0.42;

export const SCENE_LIGHT: Vec3 = [-0.471763, 0.707664, 0.526145];

export const SCENE_PERIOD = 24_000;

export const SCENE_FRAME = 1000 / 18;

export const CRYSTAL_SPARKS: Vec3[] = [
    [0.12, 0.2, 0.08],
    [-0.24, -0.34, -0.12],
    [0.02, 0.62, -0.18],
];

export const CRYSTAL_CURVES = [
    {
        turns: 1,
        samples: 220,
        tilt: 0.55,
        radius: (t: number) => 1.62 + Math.sin(t * 3) * 0.16,
        height: (t: number) => Math.sin(t * 2) * 0.52,
        width: 1.5,
        opacity: 0.72,
    },
    {
        turns: 1,
        samples: 220,
        tilt: -0.95,
        radius: (t: number) => 1.42 + Math.cos(t * 2) * 0.24,
        height: (t: number) => Math.cos(t * 3) * 0.42 - 0.1,
        width: 1.1,
        opacity: 0.5,
    },
    {
        turns: 1,
        samples: 220,
        tilt: 0.18,
        radius: (t: number) => 1.92 + Math.sin(t * 5) * 0.1,
        height: (t: number) => Math.sin(t * 4) * 0.22 + 0.24,
        width: 0.9,
        opacity: 0.32,
    },
];

export interface CrystalFace {
    vertices: number[];
    inner?: boolean;
}

function upper(i: number): number {
    return 1 + (i % 5);
}

function lower(i: number): number {
    return 6 + (i % 5);
}

function buildCrystal(): { vertices: Vec3[]; faces: CrystalFace[] } {
    const vertices: Vec3[] = [[0.08, 1.22, 0.06]];

    const rings = [
        { count: 5, y: 0.34, radius: 0.92, phase: 0 },
        { count: 5, y: -0.3, radius: 0.72, phase: 0.62 },
    ];

    rings.forEach((ring, index) => {
        for (let i = 0; i < ring.count; i += 1) {
            const angle = ring.phase + (i / ring.count) * Math.PI * 2;

            const radius = ring.radius * (0.78 + noise(index * 13 + i) * 0.42);
            const height = ring.y + (noise(index * 31 + i) - 0.5) * 0.26;

            vertices.push([Math.cos(angle) * radius, height, Math.sin(angle) * radius]);
        }
    });

    vertices.push([-0.1, -1.16, -0.04]);

    const top = 0;
    const bottom = vertices.length - 1;

    const faces: CrystalFace[] = [];

    for (let i = 0; i < 5; i += 1) {
        faces.push({ vertices: [top, upper(i), upper(i + 1)] });
        faces.push({ vertices: [upper(i), lower(i), upper(i + 1)] });
        faces.push({ vertices: [upper(i + 1), lower(i), lower(i + 1)] });
        faces.push({ vertices: [lower(i), bottom, lower(i + 1)] });
    }

    faces.push({ vertices: [upper(0), lower(2), upper(3)], inner: true });
    faces.push({ vertices: [top, lower(1), lower(4)], inner: true });

    return { vertices, faces };
}

export const CRYSTAL_MODEL = buildCrystal();

// The main diamond breathes too, gently, so it stays the centrepiece.
export const CRYSTAL_MAIN_PULSE = { amount: 0.08, frequency: 0.25, phase: 0 };

// One wave of a small diamond's wander: up to `reach` screen percent, a minute or two a lap.
const swarmWave = (reach: number) => ({
    amplitude: reach * (0.4 + Math.random() * 0.6),
    frequency: 0.04 + Math.random() * 0.08,
    phase: Math.random() * Math.PI * 2,
});

// The hues the smaller diamonds wear, shuffled on each load so neighbours differ.
const CRYSTAL_HUES = ['pink', 'green', 'cyan', 'red', 'blue', 'orange', 'purple']
    .map((hue) => ({ hue, order: Math.random() }))
    .toSorted((a, b) => a.order - b.order)
    .map(({ hue }) => `var(--gem-${hue})`);

// The smaller diamonds around the main one, drawn fresh on every load: five to eight of them,
// mostly small with the odd large one, on alternating sides of the centre so they frame the
// main diamond instead of covering it. Each turns at its own speed and direction, and wanders
// on two slow waves per axis (in vw and vh) so it drifts in a direction that keeps changing.
export const CRYSTAL_SWARM = Array.from({ length: 5 + Math.floor(Math.random() * 4) }, (_, i) => {
    const size = 3 + Math.random() ** 1.6 * 8;

    return {
        key: `crystal-${i}`,
        hue: CRYSTAL_HUES[i % CRYSTAL_HUES.length],
        left: i % 2 === 0 ? 6 + Math.random() * 24 : 70 + Math.random() * 24,
        top: 8 + Math.random() * 60,
        size,
        opacity: 0.35 + (size / 11) * 0.5,
        speed: (0.6 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1),
        phase: Math.random() * Math.PI * 2,
        waves: {
            x: [swarmWave(6), swarmWave(4)],
            y: [swarmWave(5), swarmWave(3)],
        },
        // Grows and shrinks around its size: how far, how fast (radians a second), where it starts.
        pulse: {
            amount: 0.2 + Math.random() * 0.25,
            frequency: 0.15 + Math.random() * 0.25,
            phase: Math.random() * Math.PI * 2,
        },
    };
});

// Two nodes closer than this, in lattice units, are linked. The link fades as they part.
export const LATTICE_LINK_DISTANCE = 260;

// One slow sine wave of a node's drift: how far, how fast (radians a second), where it starts.
const latticeWave = (seed: number) => ({
    amplitude: 40 + noise(seed) * 80,
    frequency: 0.06 + noise(seed + 1) * 0.14,
    phase: noise(seed + 2) * Math.PI * 2,
});

// Each node drifts on two waves per axis at unrelated frequencies, so no node retraces its
// path and the links between them keep forming and breaking in a pattern that never repeats.
export const LATTICE_NODES = Array.from({ length: 22 }, (_, i) => ({
    key: `n-${i}`,
    x: 60 + noise(i * 7 + 1) * 1320,
    y: 40 + noise(i * 11 + 3) * 560,
    r: 1.1 + noise(i * 17 + 5) * 1.9,
    opacity: 0.16 + noise(i * 23) * 0.24,
    waves: {
        x: [latticeWave(i * 41 + 1), latticeWave(i * 43 + 5)],
        y: [latticeWave(i * 47 + 3), latticeWave(i * 53 + 7)],
    },
}));

// Every pair of nodes, each drawn as one line whose opacity follows their distance.
export const LATTICE_PAIRS = LATTICE_NODES.flatMap((_, i) =>
    LATTICE_NODES.slice(i + 1).map((__, k) => ({ i, j: i + 1 + k, key: `${i}-${i + 1 + k}` })),
);

export const LATTICE_VERTICALS = Array.from({ length: 15 }, (_, i) => ({
    key: `v-${i}`,
    x1: (i / 14) * 1440,
    x2: 220 + (i / 14) * 1000,
}));

export const SCENE_PARTICLES = Array.from({ length: 26 }, (_, i) => ({
    left: noise(i * 3 + 2) * 100,
    top: noise(i * 5 + 9) * 92,
    size: 1 + noise(i * 13 + 4) * 2.2,
    opacity: 0.12 + noise(i * 19 + 6) * 0.4,
    duration: 16 + noise(i * 29 + 8) * 22,
    delay: noise(i * 37 + 11) * -30,
}));

export interface Shard {
    x: number;
    y: number;
    size: number;
    opacity: number;
}

export const DEBRIS_CUBES: Shard[] = [
    { x: 86, y: 150, size: 30, opacity: 0.55 },
    { x: 322, y: 118, size: 20, opacity: 0.4 },
    { x: 46, y: 372, size: 24, opacity: 0.45 },
    { x: 352, y: 330, size: 34, opacity: 0.5 },
    { x: 214, y: 452, size: 18, opacity: 0.35 },
];

export const DEBRIS_SPHERES: Shard[] = [
    { x: 30, y: 250, size: 13, opacity: 0.6 },
    { x: 372, y: 214, size: 9, opacity: 0.45 },
    { x: 300, y: 432, size: 16, opacity: 0.5 },
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
