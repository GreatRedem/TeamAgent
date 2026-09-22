import { DEBRIS_CUBES, DEBRIS_SPHERES } from '../../lib/constant';

export function Debris()
{
    return (
        <svg className="absolute inset-0 size-full" viewBox="0 0 420 500" role="presentation" focusable="false">
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

            { DEBRIS_CUBES.map((cube) => (
                <g key={ `cube-${ cube.x }-${ cube.y }` } opacity={ cube.opacity } transform={ `translate(${ cube.x } ${ cube.y })` }>
                    <polygon points={ `0,${ -cube.size * 0.5 } ${ cube.size },0 0,${ cube.size * 0.5 } ${ -cube.size },0` } fill="url(#cubeTop)" />
                    <polygon points={ `${ -cube.size },0 0,${ cube.size * 0.5 } 0,${ cube.size * 1.4 } ${ -cube.size },${ cube.size * 0.9 }` } fill="var(--facet-deep)" opacity="0.85" />
                    <polygon points={ `${ cube.size },0 0,${ cube.size * 0.5 } 0,${ cube.size * 1.4 } ${ cube.size },${ cube.size * 0.9 }` } fill="var(--facet-lo)" opacity="0.55" />
                </g>
            )) }

            { DEBRIS_SPHERES.map((sphere) => (
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
