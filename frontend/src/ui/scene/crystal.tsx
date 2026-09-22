import { useId, useMemo } from 'react';

import {
    CRYSTAL_CURVES,
    CRYSTAL_MODEL,
    CRYSTAL_SPARKS,
    SCENE_LIGHT,
    SCENE_PITCH,
    SCENE_SCALE,
} from '@/libs/constant';

import {
    centroid,
    dot,
    faceNormal,
    type Projected,
    project,
    rotate,
    splitByDepth,
    toPoints,
    type Vec3,
} from './projection';

function curvePoints(curve: (typeof CRYSTAL_CURVES)[number], yaw: number): Projected[] {
    const points: Projected[] = [];

    for (let i = 0; i <= curve.samples; i += 1) {
        const t = (i / curve.samples) * Math.PI * 2 * curve.turns;

        const r = curve.radius(t);

        const raw: Vec3 = [Math.cos(t) * r, curve.height(t), Math.sin(t) * r];

        points.push(project(rotate(raw, yaw, SCENE_PITCH + curve.tilt * 0.35), SCENE_SCALE));
    }

    return points;
}

function path(points: Projected[]): string {
    return points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ');
}

// One diamond at rotation `yaw`. `orbits` draws the rings around it; the smaller diamonds go
// without, so the swarm stays light. Each copy names its own gradient and filters.
export function Crystal({ yaw, orbits = true }: { yaw: number; orbits?: boolean }) {
    const id = useId().replace(/[^\w-]/g, '');

    const scene = useMemo(() => {
        const points = CRYSTAL_MODEL.vertices.map((v) => rotate(v, yaw, SCENE_PITCH));
        const flat = points.map((v) => project(v, SCENE_SCALE));

        const faces = CRYSTAL_MODEL.faces
            .map((face) => {
                const corners = face.vertices.map((i) => points[i]);
                const normal = faceNormal(corners[0], corners[1], corners[2]);
                const middle = centroid(corners);

                const facing = normal[2] > 0;
                const light = Math.max(0, dot(normal, SCENE_LIGHT));

                return {
                    key: face.vertices.join('-'),
                    points: toPoints(face.vertices.map((i) => flat[i])),
                    depth: middle[2],
                    inner: face.inner === true,
                    facing,
                    light,
                };
            })
            .toSorted((a, b) => a.depth - b.depth);

        const seen = new Set<string>();
        const edges: { key: string; d: string; depth: number }[] = [];

        for (const face of CRYSTAL_MODEL.faces) {
            if (face.inner === true) {
                continue;
            }

            for (let i = 0; i < face.vertices.length; i += 1) {
                const a = face.vertices[i];
                const b = face.vertices[(i + 1) % face.vertices.length];
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;

                if (seen.has(key)) {
                    continue;
                }

                seen.add(key);

                edges.push({
                    key,
                    d: `M${flat[a].x.toFixed(2)} ${flat[a].y.toFixed(2)} L${flat[b].x.toFixed(2)} ${flat[b].y.toFixed(2)}`,
                    depth: (points[a][2] + points[b][2]) / 2,
                });
            }
        }

        const curves = (orbits ? CRYSTAL_CURVES : []).map((curve, index) => {
            const { front, back } = splitByDepth(curvePoints(curve, yaw), 0.55);

            return { key: `curve-${index}`, curve, front, back };
        });

        const sparks = CRYSTAL_SPARKS.map((spark) =>
            project(rotate(spark, yaw, SCENE_PITCH), SCENE_SCALE),
        );

        return { faces, edges, curves, sparks };
    }, [yaw, orbits]);

    return (
        <svg
            className="absolute inset-0 size-full"
            viewBox="-300 -330 600 660"
            role="presentation"
            focusable="false">
            <defs>
                <radialGradient id={`${id}-core`} cx="0.5" cy="0.45" r="0.55">
                    <stop offset="0%" stopColor="var(--glow-bright)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
                </radialGradient>

                <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id={`${id}-tight`} x="-45%" y="-45%" width="190%" height="190%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <ellipse cx="0" cy="0" rx="250" ry="240" fill={`url(#${id}-core)`} />

            <g fill="none" strokeLinecap="round" filter={`url(#${id}-tight)`}>
                {scene.curves.map(({ key, curve, back }) =>
                    back.map((run, i) => (
                        <path
                            // biome-ignore lint/suspicious/noArrayIndexKey: a stroke of a fixed decorative curve; the list is static and never reorders, so the index is its identity
                            key={`${key}-back-${i}`}
                            d={path(run)}
                            stroke="var(--glow-bright)"
                            strokeWidth={curve.width}
                            opacity={curve.opacity * 0.4}
                        />
                    )),
                )}
            </g>

            <g>
                {scene.faces.map((face) => (
                    <polygon
                        key={face.key}
                        points={face.points}
                        fill={
                            face.inner
                                ? 'var(--facet-hi)'
                                : face.light > 0.55
                                  ? 'var(--facet-hi)'
                                  : face.light > 0.25
                                    ? 'var(--facet-lo)'
                                    : 'var(--facet-deep)'
                        }
                        opacity={face.inner ? 0.07 : face.facing ? 0.12 : 0.34 + face.light * 0.5}
                    />
                ))}
            </g>

            <g filter={`url(#${id}-soft)`}>
                {scene.sparks.map((spark, i) => (
                    <circle
                        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative spark; the list is static and never reorders, so the index is its identity
                        key={`spark-${i}`}
                        cx={spark.x}
                        cy={spark.y}
                        r={2.4}
                        fill="var(--glow-bright)"
                        opacity={0.5 + spark.z * 0.25}
                    />
                ))}
            </g>

            <g fill="none" strokeLinecap="round" filter={`url(#${id}-tight)`}>
                {scene.edges.map((edge) => (
                    <path
                        key={edge.key}
                        d={edge.d}
                        stroke="var(--glow-bright)"
                        strokeWidth={edge.depth > 0 ? 1.7 : 1}
                        opacity={0.3 + Math.max(0, edge.depth) * 0.62}
                    />
                ))}
            </g>

            <g fill="none" strokeLinecap="round" filter={`url(#${id}-tight)`}>
                {scene.curves.map(({ key, curve, front }) =>
                    front.map((run, i) => (
                        <path
                            // biome-ignore lint/suspicious/noArrayIndexKey: a stroke of a fixed decorative curve; the list is static and never reorders, so the index is its identity
                            key={`${key}-front-${i}`}
                            d={path(run)}
                            stroke="var(--glow-bright)"
                            strokeWidth={curve.width}
                            opacity={curve.opacity}
                        />
                    )),
                )}
            </g>
        </svg>
    );
}
