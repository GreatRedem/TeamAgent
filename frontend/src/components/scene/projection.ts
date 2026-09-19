/**
 * A minimal 3D projector for the background art.
 *
 * The scene needs four things that are painful to fake by hand in flat SVG:
 * an asymmetric solid whose facets are shaded by their real orientation,
 * curves that genuinely pass in front of and behind that solid, correct
 * painter's-order depth, and a slow rotation that keeps all of it consistent.
 * Deriving them from actual coordinates is less code than hand-drawing each
 * state, and it is why the geometry reads as precise rather than decorative.
 *
 * Weak perspective is deliberate: the brief asks for a 35-50mm look, so the
 * focal length is long enough that there is depth without wide-angle flare.
 */

export type Vec3 = readonly [number, number, number];

/** Distance from camera to origin, in model units. Larger is flatter. */
const FOCAL = 4.2;

export function rotate(point: Vec3, yaw: number, pitch: number): Vec3
{
    const [ x, y, z ] = point;

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    const x1 = x * cy + z * sy;
    const z1 = z * cy - x * sy;

    const cx = Math.cos(pitch);
    const sx = Math.sin(pitch);

    return [ x1, y * cx - z1 * sx, y * sx + z1 * cx ];
}

export interface Projected
{
    x: number;
    y: number;
    /** Camera-space depth: larger is nearer. Used for sorting and for glow. */
    z: number;
}

export function project(point: Vec3, scale: number): Projected
{
    const [ x, y, z ] = point;

    const k = (FOCAL / (FOCAL - z)) * scale;

    // SVG y grows downward; the model is authored y-up.
    return { x: x * k, y: -y * k, z };
}

export function subtract(a: Vec3, b: Vec3): Vec3
{
    return [ a[0] - b[0], a[1] - b[1], a[2] - b[2] ];
}

export function cross(a: Vec3, b: Vec3): Vec3
{
    return [ a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0] ];
}

export function normalize(v: Vec3): Vec3
{
    const length = Math.hypot(v[0], v[1], v[2]) || 1;

    return [ v[0] / length, v[1] / length, v[2] / length ];
}

export function dot(a: Vec3, b: Vec3): number
{
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function centroid(points: Vec3[]): Vec3
{
    const sum = points.reduce<[number, number, number]>((acc, p) => [ acc[0] + p[0], acc[1] + p[1], acc[2] + p[2] ], [ 0, 0, 0 ]);

    return [ sum[0] / points.length, sum[1] / points.length, sum[2] / points.length ];
}

export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3
{
    return normalize(cross(subtract(b, a), subtract(c, a)));
}

/**
 * Deterministic pseudo-random in [0, 1).
 *
 * The composition must be identical on every render and every reload -- the
 * brief calls for a distribution that "feels natural and asymmetrical", not one
 * that reshuffles when React re-renders. A seeded hash gives scattered
 * positions that are nonetheless fixed.
 */
export function noise(seed: number): number
{
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.545;

    return x - Math.floor(x);
}

export function toPoints(points: Projected[]): string
{
    return points.map((p) => `${ p.x.toFixed(2) },${ p.y.toFixed(2) }`).join(' ');
}

/**
 * Splits a projected polyline into runs that are nearer than `depth` and runs
 * that are further, so a curve can be drawn partly behind a solid and partly
 * over it. One point of overlap is kept between runs so the halves meet
 * without a visible gap.
 */
export function splitByDepth(points: Projected[], depth: number): { front: Projected[][]; back: Projected[][] }
{
    const front: Projected[][] = [ ];
    const back: Projected[][] = [ ];

    let run: Projected[] = [ ];
    let runIsFront = points.length > 0 && points[0].z > depth;

    for (const point of points)
    {
        const isFront = point.z > depth;

        if (isFront !== runIsFront)
        {
            run.push(point);

            if (run.length > 1)
            {
                (runIsFront ? front : back).push(run);
            }

            run = [ point ];
            runIsFront = isFront;

            continue;
        }

        run.push(point);
    }

    if (run.length > 1)
    {
        (runIsFront ? front : back).push(run);
    }

    return { front, back };
}
