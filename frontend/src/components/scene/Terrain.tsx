/**
 * The rock field along the bottom of the scene.
 *
 * The reference reads as solid shattered blocks, not flat tiles, so each slab
 * is extruded: a lit top face plus a darker front face dropped from its
 * leading edge. `points` lists the top face clockwise, and the last two entries
 * are the leading edge the front face is built from.
 *
 * Anchored to the bottom and cropped horizontally, so the silhouette holds at
 * any viewport width.
 */

interface Slab
{
    points: [number, number][];
    depth: number;
    lit?: boolean;
}

const FAR: Slab[] = [
    { points: [ [ 0, 258 ], [ 188, 232 ], [ 232, 268 ], [ 40, 296 ] ], depth: 26 },
    { points: [ [ 210, 278 ], [ 396, 242 ], [ 452, 280 ], [ 262, 316 ] ], depth: 22 },
    { points: [ [ 436, 254 ], [ 604, 228 ], [ 656, 266 ], [ 486, 294 ] ], depth: 30 },
    { points: [ [ 648, 282 ], [ 800, 250 ], [ 858, 288 ], [ 700, 318 ] ], depth: 24 },
    { points: [ [ 852, 258 ], [ 1016, 230 ], [ 1078, 272 ], [ 912, 300 ] ], depth: 28 },
    { points: [ [ 1070, 286 ], [ 1232, 248 ], [ 1310, 286 ], [ 1146, 320 ] ], depth: 22 },
    { points: [ [ 1298, 262 ], [ 1440, 244 ], [ 1440, 288 ], [ 1348, 300 ] ], depth: 26 }
];

const NEAR: Slab[] = [
    { points: [ [ 0, 330 ], [ 224, 302 ], [ 286, 348 ], [ 30, 380 ] ], depth: 44, lit: true },
    { points: [ [ 336, 344 ], [ 578, 316 ], [ 642, 366 ], [ 382, 398 ] ], depth: 46, lit: true },
    { points: [ [ 716, 366 ], [ 934, 338 ], [ 1004, 388 ], [ 772, 418 ] ], depth: 40, lit: true },
    { points: [ [ 1086, 356 ], [ 1314, 328 ], [ 1396, 380 ], [ 1156, 410 ] ], depth: 44, lit: true },
    { points: [ [ 96, 392 ], [ 386, 362 ], [ 452, 414 ], [ 60, 420 ] ], depth: 40 },
    { points: [ [ 492, 402 ], [ 788, 376 ], [ 862, 420 ], [ 430, 420 ] ], depth: 32 },
    { points: [ [ 890, 410 ], [ 1196, 384 ], [ 1274, 420 ], [ 846, 420 ] ], depth: 30 },
    { points: [ [ 1248, 400 ], [ 1440, 378 ], [ 1440, 420 ], [ 1212, 420 ] ], depth: 34 }
];

function toPath(points: [number, number][])
{
    return points.map(([ x, y ]) => `${ x },${ y }`).join(' ');
}

function Blocks({ slabs, face, side }: { slabs: Slab[]; face: string; side: string })
{
    return (
        <g>
            { slabs.map((slab) =>
            {
                const [ , , front, left ] = slab.points;
                const skirt: [number, number][] = [
                    left,
                    front,
                    [ front[0], front[1] + slab.depth ],
                    [ left[0], left[1] + slab.depth ]
                ];

                return (
                    <g key={ toPath(slab.points) }>
                        <polygon points={ toPath(skirt) } fill={ side } />
                        <polygon points={ toPath(slab.points) } fill={ face } />
                        { slab.lit === true && (
                            <path
                                d={ `M${ slab.points[0][0] } ${ slab.points[0][1] } L${ slab.points[1][0] } ${ slab.points[1][1] }` }
                                fill="none"
                                stroke="var(--rock-rim)"
                                strokeWidth="1"
                                opacity="0.3"
                            />
                        ) }
                    </g>
                );
            }) }
        </g>
    );
}

export function Terrain()
{
    return (
        <svg
            className="terrain"
            viewBox="0 0 1440 420"
            preserveAspectRatio="xMidYMax slice"
            role="presentation"
            focusable="false"
        >
            <defs>
                <linearGradient id="rockFar" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stopColor="var(--rock-hi)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--rock-deep)" stopOpacity="1" />
                </linearGradient>

                <linearGradient id="rockNear" x1="0.1" y1="0" x2="0.5" y2="1">
                    <stop offset="0%" stopColor="var(--rock-hi)" stopOpacity="0.26" />
                    <stop offset="100%" stopColor="var(--rock-deep)" stopOpacity="1" />
                </linearGradient>

                <filter id="trailGlow" x="-20%" y="-600%" width="140%" height="1300%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <Blocks slabs={ FAR } face="url(#rockFar)" side="var(--rock-deep)" />

            <path
                id="dataPath"
                className="terrain__trail"
                d="M1440 320 C 1288 334, 1200 354, 1056 358 C 914 362, 810 344, 674 354 C 552 364, 448 386, 356 406"
                fill="none"
                stroke="var(--glow-bright)"
                strokeWidth="3.6"
                strokeLinecap="round"
                filter="url(#trailGlow)"
            />

            {/* A single packet travelling the route. `offset-path` would need the
                d duplicated in CSS, so the motion is bound to the path itself. */}
            <circle className="terrain__packet" r="4.5" fill="var(--ink)" filter="url(#trailGlow)">
                <animateMotion dur="9s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#dataPath" />
                </animateMotion>
            </circle>

            <Blocks slabs={ NEAR } face="url(#rockNear)" side="var(--rock-deep)" />
        </svg>
    );
}
