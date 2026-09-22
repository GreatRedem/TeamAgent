import { LATTICE_LINKS, LATTICE_NODES, LATTICE_VERTICALS } from '@/libs/constant';

export function Lattice() {
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

            <g stroke="var(--glow-bright)" strokeWidth="0.7" opacity="0.14">
                {LATTICE_LINKS.map((link) => (
                    <line key={link.key} x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} />
                ))}
            </g>

            <g fill="var(--glow-bright)">
                {LATTICE_NODES.map((node, i) => (
                    <circle
                        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative node; the list is static and never reorders, so the index is its identity
                        key={`n-${i}`}
                        cx={node.x}
                        cy={node.y}
                        r={node.r}
                        opacity={node.opacity}
                    />
                ))}
            </g>
        </svg>
    );
}
