import { useMemo } from 'react';

import { centroid, dot, faceNormal, noise, normalize, project, rotate, splitByDepth, toPoints, type Projected, type Vec3 } from './projection';
import { useRotation } from './useRotation';

/**
 * The hero object: an irregular mathematical crystal wrapped in parametric
 * curves.
 *
 * The solid is authored as 3D coordinates and projected every frame rather
 * than drawn as flat paths, which is what lets the facets shade by their true
 * orientation, the edges catch light unevenly, and the orbital curves pass
 * genuinely in front of and behind the body instead of being stacked on top.
 *
 * It is deliberately not a regular octahedron: the belts differ in radius,
 * height and spacing, so no two faces repeat. Every colour resolves from a CSS
 * custom property so the scene stays inside the token system.
 */

const SCALE = 168;

/** Light arrives from the upper left and slightly in front, as the brief asks. */
const LIGHT = normalize([ -0.52, 0.78, 0.58 ]);

/** A fixed tilt, so the solid is seen from a three-quarter angle. */
const PITCH = -0.42;

interface Face
{
    vertices: number[];
    /** Interior planes read as glass rather than surface. */
    inner?: boolean;
}

/**
 * Two rings of five between two apexes. The radius and height of each ring
 * vertex is perturbed by a fixed hash, which is what makes the silhouette
 * asymmetric while every face stays exactly planar.
 */
function buildModel(): { vertices: Vec3[]; faces: Face[] }
{
    const vertices: Vec3[] = [ [ 0.08, 1.22, 0.06 ] ];

    const rings = [
        { count: 5, y: 0.34, radius: 0.92, phase: 0.0 },
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
    const upper = (i: number) => 1 + (i % 5);
    const lower = (i: number) => 6 + (i % 5);

    const faces: Face[] = [ ];

    for (let i = 0; i < 5; i += 1)
    {
        faces.push({ vertices: [ top, upper(i), upper(i + 1) ] });
        faces.push({ vertices: [ upper(i), lower(i), upper(i + 1) ] });
        faces.push({ vertices: [ upper(i + 1), lower(i), lower(i + 1) ] });
        faces.push({ vertices: [ lower(i), bottom, lower(i + 1) ] });
    }

    // Internal planes: a slice through the body and a smaller offset one, both
    // nearly transparent, so the interior reads as layered instead of hollow.
    faces.push({ vertices: [ upper(0), lower(2), upper(3) ], inner: true });
    faces.push({ vertices: [ top, lower(1), lower(4) ], inner: true });

    return { vertices, faces };
}

const MODEL = buildModel();

/** Points of light suspended inside the body. */
const SPARKS: Vec3[] = [ [ 0.12, 0.2, 0.08 ], [ -0.24, -0.34, -0.12 ], [ 0.02, 0.62, -0.18 ] ];

/**
 * Parametric trajectories, not rings.
 *
 * Each is a closed 3D curve whose radius and elevation vary with the parameter,
 * so it reads as an equation plotted in space rather than an orbit band. The
 * brief rules out anything that looks like Saturn's rings, which is exactly
 * what a constant-radius flat ellipse gives.
 */
const CURVES = [
    { turns: 1, samples: 220, tilt: 0.55, radius: (t: number) => 1.62 + Math.sin(t * 3) * 0.16, height: (t: number) => Math.sin(t * 2) * 0.52, width: 1.5, opacity: 0.72 },
    { turns: 1, samples: 220, tilt: -0.95, radius: (t: number) => 1.42 + Math.cos(t * 2) * 0.24, height: (t: number) => Math.cos(t * 3) * 0.42 - 0.1, width: 1.1, opacity: 0.5 },
    { turns: 1, samples: 220, tilt: 0.18, radius: (t: number) => 1.92 + Math.sin(t * 5) * 0.1, height: (t: number) => Math.sin(t * 4) * 0.22 + 0.24, width: 0.9, opacity: 0.32 }
];

function curvePoints(curve: typeof CURVES[number], yaw: number): Projected[]
{
    const points: Projected[] = [ ];

    for (let i = 0; i <= curve.samples; i += 1)
    {
        const t = (i / curve.samples) * Math.PI * 2 * curve.turns;

        const r = curve.radius(t);

        const raw: Vec3 = [ Math.cos(t) * r, curve.height(t), Math.sin(t) * r ];

        points.push(project(rotate(raw, yaw, PITCH + curve.tilt * 0.35), SCALE));
    }

    return points;
}

function path(points: Projected[]): string
{
    return points.map((p, i) => `${ i === 0 ? 'M' : 'L' }${ p.x.toFixed(2) } ${ p.y.toFixed(2) }`).join(' ');
}

export function Crystal()
{
    const yaw = useRotation();

    const scene = useMemo(() =>
    {
        const points = MODEL.vertices.map((v) => rotate(v, yaw, PITCH));
        const flat = points.map((v) => project(v, SCALE));

        const faces = MODEL.faces
            .map((face) =>
            {
                const corners = face.vertices.map((i) => points[i]);
                const normal = faceNormal(corners[0], corners[1], corners[2]);
                const middle = centroid(corners);

                // Facing away from the camera: still drawn, but faint, because
                // the material is glass.
                const facing = normal[2] > 0;
                const light = Math.max(0, dot(normal, LIGHT));

                return {
                    key: face.vertices.join('-'),
                    points: toPoints(face.vertices.map((i) => flat[i])),
                    depth: middle[2],
                    inner: face.inner === true,
                    facing,
                    light
                };
            })
            .sort((a, b) => a.depth - b.depth);

        // Unique edges, so shared ones are not stroked twice.
        const seen = new Set<string>();
        const edges: { key: string; d: string; depth: number }[] = [ ];

        for (const face of MODEL.faces)
        {
            if (face.inner === true)
            {
                continue;
            }

            for (let i = 0; i < face.vertices.length; i += 1)
            {
                const a = face.vertices[i];
                const b = face.vertices[(i + 1) % face.vertices.length];
                const key = a < b ? `${ a }-${ b }` : `${ b }-${ a }`;

                if (seen.has(key))
                {
                    continue;
                }

                seen.add(key);

                edges.push({
                    key,
                    d: `M${ flat[a].x.toFixed(2) } ${ flat[a].y.toFixed(2) } L${ flat[b].x.toFixed(2) } ${ flat[b].y.toFixed(2) }`,
                    depth: (points[a][2] + points[b][2]) / 2
                });
            }
        }

        const curves = CURVES.map((curve, index) =>
        {
            // Split against the body's own radius, not zero, so a curve only
            // counts as "in front" once it clears the solid.
            const { front, back } = splitByDepth(curvePoints(curve, yaw), 0.55);

            return { key: `curve-${ index }`, curve, front, back };
        });

        const sparks = SPARKS.map((spark) => project(rotate(spark, yaw, PITCH), SCALE));

        return { faces, edges, curves, sparks };
    }, [ yaw ]);

    return (
        <svg className="crystal" viewBox="-300 -330 600 660" role="presentation" focusable="false">
            <defs>
                <radialGradient id="crystalCore" cx="0.5" cy="0.45" r="0.55">
                    <stop offset="0%" stopColor="var(--glow-bright)" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
                </radialGradient>

                <filter id="glowSoft" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="14" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id="glowTight" x="-45%" y="-45%" width="190%" height="190%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* the light the solid casts into the surrounding air */}
            <ellipse cx="0" cy="0" rx="250" ry="240" fill="url(#crystalCore)" />

            {/* curve segments running behind the body */}
            <g fill="none" strokeLinecap="round" filter="url(#glowTight)">
                { scene.curves.map(({ key, curve, back }) => back.map((run, i) => (
                    <path
                        key={ `${ key }-back-${ i }` }
                        d={ path(run) }
                        stroke="var(--glow-bright)"
                        strokeWidth={ curve.width }
                        opacity={ curve.opacity * 0.4 }
                    />
                ))) }
            </g>

            {/* faces, painted far to near */}
            <g>
                { scene.faces.map((face) => (
                    <polygon
                        key={ face.key }
                        points={ face.points }
                        fill={ face.inner ? 'var(--facet-hi)' : (face.light > 0.55 ? 'var(--facet-hi)' : face.light > 0.25 ? 'var(--facet-lo)' : 'var(--facet-deep)') }
                        opacity={ face.inner ? 0.07 : (face.facing ? 0.12 : 0.34 + face.light * 0.5) }
                    />
                )) }
            </g>

            {/* light trapped inside the body */}
            <g filter="url(#glowSoft)">
                { scene.sparks.map((spark, i) => (
                    <circle key={ `spark-${ i }` } cx={ spark.x } cy={ spark.y } r={ 2.4 } fill="var(--glow-bright)" opacity={ 0.5 + spark.z * 0.25 } />
                )) }
            </g>

            {/* edges: the nearer an edge, the brighter it reads */}
            <g fill="none" strokeLinecap="round" filter="url(#glowTight)">
                { scene.edges.map((edge) => (
                    <path
                        key={ edge.key }
                        d={ edge.d }
                        stroke="var(--glow-bright)"
                        strokeWidth={ edge.depth > 0 ? 1.7 : 1 }
                        opacity={ 0.3 + Math.max(0, edge.depth) * 0.62 }
                    />
                )) }
            </g>

            {/* curve segments crossing in front */}
            <g fill="none" strokeLinecap="round" filter="url(#glowTight)">
                { scene.curves.map(({ key, curve, front }) => front.map((run, i) => (
                    <path
                        key={ `${ key }-front-${ i }` }
                        d={ path(run) }
                        stroke="var(--glow-bright)"
                        strokeWidth={ curve.width }
                        opacity={ curve.opacity }
                    />
                ))) }
            </g>
        </svg>
    );
}
