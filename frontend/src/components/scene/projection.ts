import { SCENE_FOCAL } from '@/lib/constant';

export type Vec3 = readonly [number, number, number];

export interface Projected
{
    x: number;
    y: number;
    z: number;
}

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

export function project(point: Vec3, scale: number): Projected
{
    const [ x, y, z ] = point;

    const k = (SCENE_FOCAL / (SCENE_FOCAL - z)) * scale;

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

export function noise(seed: number): number
{
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.545;

    return x - Math.floor(x);
}

export function toPoints(points: Projected[]): string
{
    return points.map((p) => `${ p.x.toFixed(2) },${ p.y.toFixed(2) }`).join(' ');
}

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
