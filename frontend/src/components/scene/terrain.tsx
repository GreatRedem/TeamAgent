import { type Slab, TERRAIN_FAR, TERRAIN_NEAR, TERRAIN_TRAIL } from '@/libs/constant';

function toPath(points: [number, number][]) {
    return points.map(([x, y]) => `${x},${y}`).join(' ');
}

function Blocks({ slabs, face, side }: { slabs: Slab[]; face: string; side: string }) {
    return (
        <g>
            {slabs.map((slab) => {
                const [, , front, left] = slab.points;
                const skirt: [number, number][] = [
                    left,
                    front,
                    [front[0], front[1] + slab.depth],
                    [left[0], left[1] + slab.depth],
                ];

                return (
                    <g key={toPath(slab.points)}>
                        <polygon points={toPath(skirt)} fill={side} />
                        <polygon points={toPath(slab.points)} fill={face} />
                        {slab.lit === true && (
                            <path
                                d={`M${slab.points[0][0]} ${slab.points[0][1]} L${slab.points[1][0]} ${slab.points[1][1]}`}
                                fill="none"
                                stroke="var(--rock-rim)"
                                strokeWidth="1"
                                opacity="0.3"
                            />
                        )}
                    </g>
                );
            })}
        </g>
    );
}

export function Terrain() {
    return (
        <svg
            className="absolute inset-x-0 bottom-0 h-[clamp(14rem,38vh,26rem)] w-full lg:h-[clamp(22rem,50vh,40rem)]"
            viewBox="0 0 1440 420"
            preserveAspectRatio="xMidYMax slice"
            role="presentation"
            focusable="false">
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

            <Blocks slabs={TERRAIN_FAR} face="url(#rockFar)" side="var(--rock-deep)" />

            <path
                id="dataPath"
                className="opacity-55"
                d={TERRAIN_TRAIL}
                fill="none"
                stroke="var(--glow-bright)"
                strokeWidth="3.6"
                strokeLinecap="round"
                filter="url(#trailGlow)"
            />

            <circle
                className="opacity-85 motion-reduce:hidden"
                r="4.5"
                fill="var(--ink)"
                filter="url(#trailGlow)">
                <animateMotion dur="9s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#dataPath" />
                </animateMotion>
            </circle>

            <Blocks slabs={TERRAIN_NEAR} face="url(#rockNear)" side="var(--rock-deep)" />
        </svg>
    );
}
