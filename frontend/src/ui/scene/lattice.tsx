import { useAnimationFrame, useReducedMotion } from 'motion/react';
import { useRef } from 'react';

import {
    LATTICE_LINK_DISTANCE,
    LATTICE_NODES,
    LATTICE_PAIRS,
    LATTICE_VERTICALS,
} from '@/libs/constant';

import { closeness, drift } from './projection';

// The floor grid stays put. The nodes drift, and every pair closer than the link distance is
// joined by a line that fades as they part, so the network keeps rewiring itself.
// Frames write straight to the SVG, so React does not render once per frame.
export function Lattice() {
    const still = useReducedMotion();
    const nodes = useRef<(SVGCircleElement | null)[]>([]);
    const links = useRef<(SVGLineElement | null)[]>([]);
    const start = LATTICE_NODES.map((node) => drift(node, 0));

    useAnimationFrame((time) => {
        if (still) {
            return;
        }

        const points = LATTICE_NODES.map((node) => drift(node, time / 1000));

        points.forEach((point, i) => {
            nodes.current[i]?.setAttribute('cx', point.x.toFixed(1));
            nodes.current[i]?.setAttribute('cy', point.y.toFixed(1));
        });

        LATTICE_PAIRS.forEach(({ i, j }, k) => {
            const line = links.current[k];
            const strength = closeness(points[i], points[j], LATTICE_LINK_DISTANCE);

            if (!line || (strength === 0 && line.getAttribute('opacity') === '0')) {
                return;
            }

            line.setAttribute('opacity', strength === 0 ? '0' : strength.toFixed(3));

            if (strength > 0) {
                line.setAttribute('x1', points[i].x.toFixed(1));
                line.setAttribute('y1', points[i].y.toFixed(1));
                line.setAttribute('x2', points[j].x.toFixed(1));
                line.setAttribute('y2', points[j].y.toFixed(1));
            }
        });
    });

    return (
        <svg
            className="absolute inset-x-0 top-0 h-[72%] w-full opacity-55 lg:opacity-100"
            viewBox="0 0 1440 640"
            preserveAspectRatio="xMidYMid slice"
            role="presentation"
            focusable="false">
            <g stroke="var(--glow)" strokeWidth="0.6" opacity="0.1">
                {LATTICE_VERTICALS.map(({ key, x1, x2 }) => (
                    <line key={key} x1={x1} y1="640" x2={x2} y2="150" />
                ))}

                {Array.from({ length: 6 }, (_, i) => (
                    <line
                        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative grid line; the list is static and never reorders, so the index is its identity
                        key={`h-${i}`}
                        x1="0"
                        y1={640 - i * i * 18 - 60}
                        x2="1440"
                        y2={640 - i * i * 18 - 60}
                    />
                ))}
            </g>

            <g stroke="var(--glow-bright)" strokeWidth="0.7" opacity="0.22">
                {LATTICE_PAIRS.map(({ i, j, key }, k) => (
                    <line
                        key={key}
                        ref={(line) => {
                            links.current[k] = line;
                        }}
                        x1={start[i].x}
                        y1={start[i].y}
                        x2={start[j].x}
                        y2={start[j].y}
                        opacity={closeness(start[i], start[j], LATTICE_LINK_DISTANCE)}
                    />
                ))}
            </g>

            <g fill="var(--glow-bright)">
                {LATTICE_NODES.map((node, i) => (
                    <circle
                        key={node.key}
                        ref={(circle) => {
                            nodes.current[i] = circle;
                        }}
                        cx={start[i].x}
                        cy={start[i].y}
                        r={node.r}
                        opacity={node.opacity}
                    />
                ))}
            </g>
        </svg>
    );
}
