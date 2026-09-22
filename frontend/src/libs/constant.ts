import type { LucideIcon } from 'lucide-react';
import { Bot, Cpu, LayoutGrid, MessageSquare } from 'lucide-react';

import type { AuditEntry } from '@/apis/audit';
import type { ProviderPreset } from '@/apis/model';
import { noise, type Vec3 } from '@/ui/scene/projection';

export const API_BASE_URL = '/api';

export const ACCESS_TOKEN_KEY = 'accessToken';

export const TOKENS_PER_CHARACTER = 4;

export const CONFIRM_TIMEOUT = 4000;

export const METRICS_REFRESH = 10_000;

export const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export const PAGE_WIDTH = 'mx-auto w-full max-w-5xl';

export const HEADER_OPEN_ZONE = 110;

export const HEADER_LIFT_TRAVEL = 120;

export const HEADER_IDLE_DELAY = 1600;

export const TEAM_NAMES = new Map<number, string>();

export const DESTINATIONS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: '', label: 'Overview', icon: LayoutGrid },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'bots', label: 'Bots', icon: MessageSquare },
    { id: 'models', label: 'Models', icon: Cpu },
];

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
    '[--facet-hi:var(--muted-foreground)] [--facet-lo:var(--neutral)] [--facet-deep:var(--accent)] ' +
    '[--rock-hi:var(--input)] [--rock-deep:var(--background)] [--rock-rim:var(--muted-foreground)]';

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

export interface Slab {
    points: [number, number][];
    depth: number;
    lit?: boolean;
}

export const TERRAIN_FAR: Slab[] = [
    {
        points: [
            [0, 258],
            [188, 232],
            [232, 268],
            [40, 296],
        ],
        depth: 26,
    },
    {
        points: [
            [210, 278],
            [396, 242],
            [452, 280],
            [262, 316],
        ],
        depth: 22,
    },
    {
        points: [
            [436, 254],
            [604, 228],
            [656, 266],
            [486, 294],
        ],
        depth: 30,
    },
    {
        points: [
            [648, 282],
            [800, 250],
            [858, 288],
            [700, 318],
        ],
        depth: 24,
    },
    {
        points: [
            [852, 258],
            [1016, 230],
            [1078, 272],
            [912, 300],
        ],
        depth: 28,
    },
    {
        points: [
            [1070, 286],
            [1232, 248],
            [1310, 286],
            [1146, 320],
        ],
        depth: 22,
    },
    {
        points: [
            [1298, 262],
            [1440, 244],
            [1440, 288],
            [1348, 300],
        ],
        depth: 26,
    },
];

export const TERRAIN_NEAR: Slab[] = [
    {
        points: [
            [0, 330],
            [224, 302],
            [286, 348],
            [30, 380],
        ],
        depth: 44,
        lit: true,
    },
    {
        points: [
            [336, 344],
            [578, 316],
            [642, 366],
            [382, 398],
        ],
        depth: 46,
        lit: true,
    },
    {
        points: [
            [716, 366],
            [934, 338],
            [1004, 388],
            [772, 418],
        ],
        depth: 40,
        lit: true,
    },
    {
        points: [
            [1086, 356],
            [1314, 328],
            [1396, 380],
            [1156, 410],
        ],
        depth: 44,
        lit: true,
    },
    {
        points: [
            [96, 392],
            [386, 362],
            [452, 414],
            [60, 420],
        ],
        depth: 40,
    },
    {
        points: [
            [492, 402],
            [788, 376],
            [862, 420],
            [430, 420],
        ],
        depth: 32,
    },
    {
        points: [
            [890, 410],
            [1196, 384],
            [1274, 420],
            [846, 420],
        ],
        depth: 30,
    },
    {
        points: [
            [1248, 400],
            [1440, 378],
            [1440, 420],
            [1212, 420],
        ],
        depth: 34,
    },
];

export const TERRAIN_TRAIL =
    'M1440 320 C 1288 334, 1200 354, 1056 358 C 914 362, 810 344, 674 354 C 552 364, 448 386, 356 406';

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
