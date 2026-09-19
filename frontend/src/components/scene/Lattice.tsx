import { useMemo } from 'react';

import { noise } from './projection';

/**
 * The mathematical layer: a receding coordinate grid, scattered nodes and the
 * vectors between them.
 *
 * The brief wants this "discovered gradually rather than immediately noticed",
 * so everything here is drawn at very low contrast and sits far behind the hero
 * object. Positions come from a seeded hash, not Math.random, so the graph is
 * identical on every render.
 */

const NODES = Array.from({ length: 22 }, (_, i) => ({
    x: 60 + noise(i * 7 + 1) * 1320,
    y: 40 + noise(i * 11 + 3) * 560,
    r: 1.1 + noise(i * 17 + 5) * 1.9
}));

/**
 * Each node links to its nearest neighbours, so the graph reads as a computed
 * structure rather than random lines. Short links only -- long ones across the
 * whole canvas would draw the eye.
 */
const LINKS = NODES.flatMap((node, i) => NODES
    .map((other, j) => ({ other, j, d: Math.hypot(other.x - node.x, other.y - node.y) }))
    .filter(({ j, d }) => j > i && d < 260)
    .map(({ other, j }) => ({ key: `${ i }-${ j }`, x1: node.x, y1: node.y, x2: other.x, y2: other.y })));

export function Lattice()
{
    // A grid that converges slightly, so it sits in space rather than on glass.
    const verticals = useMemo(() => Array.from({ length: 15 }, (_, i) =>
    {
        const t = i / 14;

        return { key: `v-${ i }`, x1: t * 1440, x2: 220 + t * 1000 };
    }), [ ]);

    return (
        <svg className="lattice" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
            <g stroke="var(--glow)" strokeWidth="0.6" opacity="0.1">
                { verticals.map(({ key, x1, x2 }) => (
                    <line key={ key } x1={ x1 } y1="640" x2={ x2 } y2="150" />
                )) }

                { Array.from({ length: 6 }, (_, i) => (
                    <line key={ `h-${ i }` } x1="0" y1={ 640 - i * i * 18 - 60 } x2="1440" y2={ 640 - i * i * 18 - 60 } />
                )) }
            </g>

            <g stroke="var(--glow-bright)" strokeWidth="0.7" opacity="0.14">
                { LINKS.map((link) => (
                    <line key={ link.key } x1={ link.x1 } y1={ link.y1 } x2={ link.x2 } y2={ link.y2 } />
                )) }
            </g>

            <g fill="var(--glow-bright)">
                { NODES.map((node, i) => (
                    <circle key={ `n-${ i }` } cx={ node.x } cy={ node.y } r={ node.r } opacity={ 0.16 + noise(i * 23) * 0.24 } />
                )) }
            </g>
        </svg>
    );
}
