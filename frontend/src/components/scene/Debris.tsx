/**
 * Cubes and spheres drifting around the hero object. Positions are deliberate
 * rather than random so the composition stays stable between renders.
 */

interface Shard
{
    x: number;
    y: number;
    size: number;
    opacity: number;
}

const CUBES: Shard[] = [
    { x: 86, y: 150, size: 30, opacity: 0.55 },
    { x: 322, y: 118, size: 20, opacity: 0.4 },
    { x: 46, y: 372, size: 24, opacity: 0.45 },
    { x: 352, y: 330, size: 34, opacity: 0.5 },
    { x: 214, y: 452, size: 18, opacity: 0.35 }
];

const SPHERES: Shard[] = [
    { x: 30, y: 250, size: 13, opacity: 0.6 },
    { x: 372, y: 214, size: 9, opacity: 0.45 },
    { x: 300, y: 432, size: 16, opacity: 0.5 }
];

export function Debris()
{
    return (
        <svg className="debris" viewBox="0 0 420 500" role="presentation" focusable="false">
            <defs>
                <linearGradient id="cubeTop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--facet-hi)" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="var(--facet-lo)" stopOpacity="0.3" />
                </linearGradient>

                <radialGradient id="sphereFill" cx="0.35" cy="0.3" r="0.8">
                    <stop offset="0%" stopColor="var(--facet-hi)" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="var(--facet-deep)" stopOpacity="0.95" />
                </radialGradient>
            </defs>

            { CUBES.map((cube) => (
                <g key={ `cube-${ cube.x }-${ cube.y }` } opacity={ cube.opacity } transform={ `translate(${ cube.x } ${ cube.y })` }>
                    <polygon points={ `0,${ -cube.size * 0.5 } ${ cube.size },0 0,${ cube.size * 0.5 } ${ -cube.size },0` } fill="url(#cubeTop)" />
                    <polygon points={ `${ -cube.size },0 0,${ cube.size * 0.5 } 0,${ cube.size * 1.4 } ${ -cube.size },${ cube.size * 0.9 }` } fill="var(--facet-deep)" opacity="0.85" />
                    <polygon points={ `${ cube.size },0 0,${ cube.size * 0.5 } 0,${ cube.size * 1.4 } ${ cube.size },${ cube.size * 0.9 }` } fill="var(--facet-lo)" opacity="0.55" />
                </g>
            )) }

            { SPHERES.map((sphere) => (
                <circle
                    key={ `sphere-${ sphere.x }-${ sphere.y }` }
                    cx={ sphere.x }
                    cy={ sphere.y }
                    r={ sphere.size }
                    fill="url(#sphereFill)"
                    opacity={ sphere.opacity }
                />
            )) }
        </svg>
    );
}
