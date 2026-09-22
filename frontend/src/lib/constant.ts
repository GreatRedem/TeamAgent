import type { LucideIcon } from 'lucide-react';
import { Bot, Layers, LayoutGrid, MessageSquare } from 'lucide-react';

import type { AuditEntry } from '../api/audit';
import type { ProviderPreset } from '../api/model';
import { noise, type Vec3 } from '../components/scene/projection';

export const API_BASE_URL = '/api';

export const ACCESS_TOKEN_KEY = 'accessToken';

export const TOKENS_PER_CHARACTER = 4;

export const HEADER_WIDTH = 'w-full max-w-[64rem]';

export const HEADER_OPEN_ZONE = 110;

export const HEADER_LIFT_TRAVEL = 120;

export const HEADER_IDLE_DELAY = 1600;

export const TEAM_NAMES = new Map<number, string>();

export const DESTINATIONS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: '', label: 'Overview', icon: LayoutGrid },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'bots', label: 'Bots', icon: MessageSquare },
    { id: 'models', label: 'Models', icon: Layers }
];

export const TEAM_TITLES: Record<string, string> = {
    '': 'Overview',
    overview: 'Overview',
    agents: 'Agents',
    bots: 'Bots',
    models: 'Models',
    settings: 'Settings'
};

export const WEEKDAYS = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];

export const HEAT_LEVELS = [ 'bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4' ];

export const AUDIT_RESULT: Record<AuditEntry['outcome'], { label: string; className: string }> = {
    ok: { label: 'OK', className: 'text-live' },
    error: { label: 'FAILED', className: 'text-fail' },
    skipped: { label: 'SKIPPED', className: 'text-pending' }
};

export const PROVIDER_FALLBACK: ProviderPreset[] = [
    { key: 'custom', label: 'Other OpenAI-compatible endpoint', url: '', catalog: false, key_required: false, models: [ ], hint: '' }
];

export const BYTE_UNITS = [ 'B', 'KB', 'MB', 'GB', 'TB' ];

export const METRICS_REFRESH = 10_000;

const CONTROL_BASE = 'inline-flex cursor-pointer items-center justify-center justify-self-start gap-2.5 '
    + 'rounded-control border text-sm no-underline transition-colors '
    + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live '
    + 'disabled:cursor-not-allowed disabled:opacity-50';

export const CLASS_BUTTON = `${ CONTROL_BASE } min-h-11 border-edge-strong bg-raised px-4 font-medium text-ink hover:bg-panel-hover`;

export const CLASS_GHOST = `${ CONTROL_BASE } min-h-9 border-edge-strong bg-transparent px-3 text-ink-2 hover:bg-raised hover:text-ink`;

export const CLASS_GHOST_DANGER = `${ CONTROL_BASE } min-h-9 border-fail-edge bg-transparent px-3 text-fail hover:bg-fail-wash`;

export const CLASS_GHOST_ARMED = `${ CONTROL_BASE } min-h-9 border-fail bg-fail-wash px-3 text-fail`;

export const CLASS_ICON_BUTTON = 'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-control '
    + 'border border-transparent bg-transparent text-ink-3 transition-colors hover:bg-raised hover:text-ink '
    + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live';

export const CLASS_BADGE = 'inline-flex items-center rounded-chip bg-live-wash px-1.5 py-0.5 font-mono text-[11px] text-live';

export const CLASS_BADGE_MUTED = 'inline-flex items-center rounded-chip bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink-2';

export const CLASS_CARD_GRID = 'm-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3';

export const CLASS_CARD = 'flex h-full flex-col gap-2.5 rounded-control border border-edge bg-raised p-4 text-ink no-underline transition-colors hover:border-edge-strong';

export const CLASS_CARD_LINK = `${ CLASS_CARD } focus-visible:border-edge-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live`;

export const CLASS_CARD_NAME = 'truncate text-[15px] font-semibold';

export const CLASS_CARD_META = 'font-mono text-[11px] text-ink-3 [overflow-wrap:anywhere]';

export const CLASS_CARD_BODY = 'text-[13px] text-ink-2 [overflow-wrap:anywhere]';

export const CLASS_CARD_ACTIONS = 'mt-auto flex flex-wrap items-center gap-2 pt-1';

export const CLASS_ROWS = 'm-0 grid list-none gap-2 p-0';

export const CLASS_ROW_LINK = 'grid gap-1 rounded-control border border-edge bg-raised px-4 py-3.5 text-ink no-underline transition-colors hover:border-edge-strong focus-visible:border-edge-strong';

export const CLASS_ROW = 'flex flex-wrap items-center justify-between gap-3 rounded-control border border-edge bg-raised px-4 py-3';

export const CLASS_ROW_TEXT = 'grid min-w-0 gap-1';

export const CLASS_ROW_NAME = 'font-semibold';

export const CLASS_ROW_META = 'text-sm text-ink-2 [overflow-wrap:anywhere]';

export const CLASS_ROW_ACTIONS = 'flex flex-wrap items-center gap-2';

export const CLASS_ROW_FORM = 'flex min-w-0 flex-1 flex-wrap items-center gap-2';

export const CLASS_DETAILS = 'grid gap-2';

export const CLASS_DETAILS_ROW = 'flex flex-wrap justify-between gap-3 border-b border-edge pb-2 text-sm';

export const CLASS_DETAILS_KEY = 'text-ink-3';

export const CLASS_DETAILS_VALUE = '[overflow-wrap:anywhere]';

export const CLASS_FORM = 'grid gap-3.5';

export const CLASS_FORM_ACTIONS = 'flex flex-wrap items-center gap-2.5';

export const CLASS_FIELD = 'grid gap-2';

export const CLASS_FIELD_LABEL = 'text-[13px] text-ink-3';

export const CLASS_FIELD_INPUT = 'min-h-11 w-full rounded-control border border-edge bg-well px-3 text-ink placeholder:text-ink-4 focus:border-edge-strong focus:outline-none';

export const CLASS_FIELD_HINT = 'text-xs leading-relaxed text-ink-3';

export const CLASS_NOTE = 'flex min-h-5 items-start gap-2 text-sm text-ink-2 [overflow-wrap:anywhere]';

export const CLASS_NOTE_ERROR = 'flex min-h-5 items-start gap-2 text-sm text-fail [overflow-wrap:anywhere]';

export const CLASS_PROBE: Record<string, string> = {
    ok: 'text-[13px] text-live',
    pending: 'text-[13px] text-pending',
    error: 'text-[13px] text-fail'
};

export const CLASS_DOC = 'rounded-panel border border-edge bg-panel p-4';

export const CLASS_DOC_HEAD = 'mb-2.5 flex flex-wrap items-center gap-3';

export const CLASS_DOC_NAME = 'font-mono text-sm font-semibold';

export const CLASS_DOC_COST = 'me-auto whitespace-nowrap font-mono text-xs text-ink-3';

export const CLASS_DOC_EDITOR = 'w-full rounded-control border border-edge-strong bg-well p-3 font-mono text-[13px] leading-relaxed text-ink focus:outline-none';

export const CLASS_DOC_READER = `${ CLASS_DOC_EDITOR } m-0 max-h-80 overflow-auto whitespace-pre-wrap`;

export const CLASS_THREAD = 'w-full cursor-pointer rounded-control border-0 bg-transparent p-0 text-start text-ink';

export const CLASS_THREAD_BODY = 'mt-3 grid gap-2 border-t border-edge pt-3';

export const CLASS_BUBBLE_TEXT = 'block whitespace-pre-wrap [overflow-wrap:anywhere]';

export const CLASS_BUBBLE_TIME = 'mt-1 block text-[11px] text-ink-4';

export const SCENE_FOCAL = 4.2;

export const SCENE_SCALE = 168;

export const SCENE_PITCH = -0.42;

export const SCENE_LIGHT: Vec3 = [ -0.471763, 0.707664, 0.526145 ];

export const SCENE_PERIOD = 24_000;

export const SCENE_FRAME = 1000 / 18;

export const CRYSTAL_SPARKS: Vec3[] = [ [ 0.12, 0.2, 0.08 ], [ -0.24, -0.34, -0.12 ], [ 0.02, 0.62, -0.18 ] ];

export const CRYSTAL_CURVES = [
    { turns: 1, samples: 220, tilt: 0.55, radius: (t: number) => 1.62 + Math.sin(t * 3) * 0.16, height: (t: number) => Math.sin(t * 2) * 0.52, width: 1.5, opacity: 0.72 },
    { turns: 1, samples: 220, tilt: -0.95, radius: (t: number) => 1.42 + Math.cos(t * 2) * 0.24, height: (t: number) => Math.cos(t * 3) * 0.42 - 0.1, width: 1.1, opacity: 0.5 },
    { turns: 1, samples: 220, tilt: 0.18, radius: (t: number) => 1.92 + Math.sin(t * 5) * 0.1, height: (t: number) => Math.sin(t * 4) * 0.22 + 0.24, width: 0.9, opacity: 0.32 }
];

export interface CrystalFace
{
    vertices: number[];
    inner?: boolean;
}

function upper(i: number): number
{
    return 1 + (i % 5);
}

function lower(i: number): number
{
    return 6 + (i % 5);
}

function buildCrystal(): { vertices: Vec3[]; faces: CrystalFace[] }
{
    const vertices: Vec3[] = [ [ 0.08, 1.22, 0.06 ] ];

    const rings = [
        { count: 5, y: 0.34, radius: 0.92, phase: 0 },
        { count: 5, y: -0.3, radius: 0.72, phase: 0.62 }
    ];

    rings.forEach((ring, index) =>
    {
        for (let i = 0; i < ring.count; i += 1)
        {
            const angle = ring.phase + (i / ring.count) * Math.PI * 2;

            const radius = ring.radius * (0.78 + noise(index * 13 + i) * 0.42);
            const height = ring.y + (noise(index * 31 + i) - 0.5) * 0.26;

            vertices.push([ Math.cos(angle) * radius, height, Math.sin(angle) * radius ]);
        }
    });

    vertices.push([ -0.1, -1.16, -0.04 ]);

    const top = 0;
    const bottom = vertices.length - 1;

    const faces: CrystalFace[] = [ ];

    for (let i = 0; i < 5; i += 1)
    {
        faces.push({ vertices: [ top, upper(i), upper(i + 1) ] });
        faces.push({ vertices: [ upper(i), lower(i), upper(i + 1) ] });
        faces.push({ vertices: [ upper(i + 1), lower(i), lower(i + 1) ] });
        faces.push({ vertices: [ lower(i), bottom, lower(i + 1) ] });
    }

    faces.push({ vertices: [ upper(0), lower(2), upper(3) ], inner: true });
    faces.push({ vertices: [ top, lower(1), lower(4) ], inner: true });

    return { vertices, faces };
}

export const CRYSTAL_MODEL = buildCrystal();

export const LATTICE_NODES = Array.from({ length: 22 }, (_, i) => ({
    x: 60 + noise(i * 7 + 1) * 1320,
    y: 40 + noise(i * 11 + 3) * 560,
    r: 1.1 + noise(i * 17 + 5) * 1.9,
    opacity: 0.16 + noise(i * 23) * 0.24
}));

export const LATTICE_LINKS = LATTICE_NODES.flatMap((node, i) => LATTICE_NODES
    .map((other, j) => ({ other, j, d: Math.hypot(other.x - node.x, other.y - node.y) }))
    .filter(({ j, d }) => j > i && d < 260)
    .map(({ other, j }) => ({ key: `${ i }-${ j }`, x1: node.x, y1: node.y, x2: other.x, y2: other.y })));

export const LATTICE_VERTICALS = Array.from({ length: 15 }, (_, i) => ({
    key: `v-${ i }`,
    x1: (i / 14) * 1440,
    x2: 220 + (i / 14) * 1000
}));

export const SCENE_PARTICLES = Array.from({ length: 26 }, (_, i) => ({
    left: noise(i * 3 + 2) * 100,
    top: noise(i * 5 + 9) * 92,
    size: 1 + noise(i * 13 + 4) * 2.2,
    opacity: 0.12 + noise(i * 19 + 6) * 0.4,
    duration: 16 + noise(i * 29 + 8) * 22,
    delay: noise(i * 37 + 11) * -30
}));

export interface Shard
{
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
    { x: 214, y: 452, size: 18, opacity: 0.35 }
];

export const DEBRIS_SPHERES: Shard[] = [
    { x: 30, y: 250, size: 13, opacity: 0.6 },
    { x: 372, y: 214, size: 9, opacity: 0.45 },
    { x: 300, y: 432, size: 16, opacity: 0.5 }
];

export interface Slab
{
    points: [number, number][];
    depth: number;
    lit?: boolean;
}

export const TERRAIN_FAR: Slab[] = [
    { points: [ [ 0, 258 ], [ 188, 232 ], [ 232, 268 ], [ 40, 296 ] ], depth: 26 },
    { points: [ [ 210, 278 ], [ 396, 242 ], [ 452, 280 ], [ 262, 316 ] ], depth: 22 },
    { points: [ [ 436, 254 ], [ 604, 228 ], [ 656, 266 ], [ 486, 294 ] ], depth: 30 },
    { points: [ [ 648, 282 ], [ 800, 250 ], [ 858, 288 ], [ 700, 318 ] ], depth: 24 },
    { points: [ [ 852, 258 ], [ 1016, 230 ], [ 1078, 272 ], [ 912, 300 ] ], depth: 28 },
    { points: [ [ 1070, 286 ], [ 1232, 248 ], [ 1310, 286 ], [ 1146, 320 ] ], depth: 22 },
    { points: [ [ 1298, 262 ], [ 1440, 244 ], [ 1440, 288 ], [ 1348, 300 ] ], depth: 26 }
];

export const TERRAIN_NEAR: Slab[] = [
    { points: [ [ 0, 330 ], [ 224, 302 ], [ 286, 348 ], [ 30, 380 ] ], depth: 44, lit: true },
    { points: [ [ 336, 344 ], [ 578, 316 ], [ 642, 366 ], [ 382, 398 ] ], depth: 46, lit: true },
    { points: [ [ 716, 366 ], [ 934, 338 ], [ 1004, 388 ], [ 772, 418 ] ], depth: 40, lit: true },
    { points: [ [ 1086, 356 ], [ 1314, 328 ], [ 1396, 380 ], [ 1156, 410 ] ], depth: 44, lit: true },
    { points: [ [ 96, 392 ], [ 386, 362 ], [ 452, 414 ], [ 60, 420 ] ], depth: 40 },
    { points: [ [ 492, 402 ], [ 788, 376 ], [ 862, 420 ], [ 430, 420 ] ], depth: 32 },
    { points: [ [ 890, 410 ], [ 1196, 384 ], [ 1274, 420 ], [ 846, 420 ] ], depth: 30 },
    { points: [ [ 1248, 400 ], [ 1440, 378 ], [ 1440, 420 ], [ 1212, 420 ] ], depth: 34 }
];

export const TERRAIN_TRAIL = 'M1440 320 C 1288 334, 1200 354, 1056 358 C 914 362, 810 344, 674 354 C 552 364, 448 386, 356 406';

export const CLASS_MONO_LABEL = 'font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3';

export const CLASS_PAGER = 'inline-flex size-11 items-center justify-center rounded-chip border border-edge bg-well text-ink-4 '
    + 'lg:size-7 enabled:border-edge-strong enabled:bg-raised enabled:text-ink-2 enabled:hover:text-ink disabled:cursor-not-allowed';

export const CLASS_AUDIT_COLUMNS = 'grid grid-cols-[0.8fr_1fr_0.6fr_0.8fr] gap-3 px-[18px] md:grid-cols-[0.7fr_0.8fr_1.3fr_0.9fr_0.6fr_0.8fr]';

export const CLASS_FILTER = 'inline-flex h-11 items-center gap-[7px] rounded-control border px-3.5 text-[13px] lg:h-[34px]';

export const CLASS_MENU_ITEM = 'flex h-10 items-center gap-2.5 rounded-control px-2.5 text-sm text-ink-2 no-underline hover:bg-raised hover:text-ink';

export const CLASS_NAV_LINK = 'flex h-9 shrink-0 items-center gap-2 rounded-control px-2.5 text-sm no-underline transition-colors';

export const LED_FILL: Record<'live' | 'degraded' | 'off', string> = {
    live: 'bg-live ring-3 ring-live/15',
    degraded: 'bg-pending',
    off: 'bg-off'
};

export const CLASS_SCENE_PALETTE = '[--glow:var(--nura-heat-2)] [--glow-bright:var(--nura-live)] [--ink:var(--nura-text)] '
    + '[--facet-hi:var(--nura-text-2)] [--facet-lo:var(--nura-off)] [--facet-deep:var(--nura-raised)] '
    + '[--rock-hi:var(--nura-line-strong)] [--rock-deep:var(--nura-bg)] [--rock-rim:var(--nura-text-3)]';

export const CLASS_SCENE_ROOT = 'pointer-events-none fixed inset-0 -z-1 overflow-hidden '
    + 'bg-[radial-gradient(120%_90%_at_50%_8%,var(--nura-panel-hover)_0%,transparent_60%),linear-gradient(180deg,var(--nura-well)_0%,var(--nura-bg)_100%)]';

export const CLASS_BUBBLE_IN = 'm-0 grid gap-0.5 rounded-control border border-edge bg-raised px-3 py-2 text-sm';

export const CLASS_BUBBLE_OUT = 'm-0 grid gap-0.5 rounded-control border border-live-edge bg-live-wash px-3 py-2 text-sm';
