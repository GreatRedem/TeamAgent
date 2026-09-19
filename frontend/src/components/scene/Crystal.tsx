/**
 * The hero object: a glass octahedron inside a glowing orbital ring.
 *
 * The ring is drawn in two passes -- the full ellipse behind the crystal, then
 * its front arc over the top -- so it reads as orbiting rather than overlaid.
 *
 * Facet brightness runs from upper-left down to lower-right, which is what
 * gives the solid a direction of light instead of looking like a wireframe.
 * Every colour resolves from a CSS custom property, so the scene stays part of
 * the token system instead of hard-coding a second palette.
 */
export function Crystal()
{
    return (
        <svg className="crystal" viewBox="0 0 560 580" role="presentation" focusable="false">
            <defs>
                <linearGradient id="facetHi" x1="0.1" y1="0" x2="0.75" y2="1">
                    <stop offset="0%" stopColor="var(--facet-hi)" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="var(--facet-hi)" stopOpacity="0.45" />
                </linearGradient>

                <linearGradient id="facetMid" x1="0.9" y1="0" x2="0.2" y2="1">
                    <stop offset="0%" stopColor="var(--facet-hi)" stopOpacity="0.62" />
                    <stop offset="100%" stopColor="var(--facet-lo)" stopOpacity="0.38" />
                </linearGradient>

                <linearGradient id="facetLo" x1="0.4" y1="0" x2="0.6" y2="1">
                    <stop offset="0%" stopColor="var(--facet-lo)" stopOpacity="0.72" />
                    <stop offset="100%" stopColor="var(--facet-deep)" stopOpacity="0.92" />
                </linearGradient>

                <linearGradient id="facetDeep" x1="0.2" y1="0" x2="0.9" y2="1">
                    <stop offset="0%" stopColor="var(--facet-lo)" stopOpacity="0.46" />
                    <stop offset="100%" stopColor="var(--facet-deep)" stopOpacity="0.98" />
                </linearGradient>

                <filter id="glowSoft" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="16" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id="glowTight" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* ambient bloom behind the object */}
            <ellipse cx="280" cy="280" rx="215" ry="205" fill="var(--glow)" opacity="0.16" filter="url(#glowSoft)" />

            {/* orbital ring, back half */}
            <g transform="translate(280 300) rotate(-14)">
                <ellipse rx="238" ry="56" fill="none" stroke="var(--glow-bright)" strokeWidth="2.2" opacity="0.5" filter="url(#glowSoft)" />
            </g>

            {/* far facets, faint through the glass */}
            <g opacity="0.16">
                <polygon points="280,70 112,268 280,215" fill="url(#facetMid)" />
                <polygon points="280,70 448,268 280,215" fill="url(#facetLo)" />
                <polygon points="112,268 280,516 280,215" fill="url(#facetDeep)" />
                <polygon points="448,268 280,516 280,215" fill="url(#facetDeep)" />
            </g>

            {/* near facets: light falls from the upper left */}
            <polygon points="280,70 112,268 280,326" fill="url(#facetHi)" />
            <polygon points="280,70 448,268 280,326" fill="url(#facetMid)" />
            <polygon points="112,268 280,516 280,326" fill="url(#facetLo)" />
            <polygon points="448,268 280,516 280,326" fill="url(#facetDeep)" />

            {/* glowing edges */}
            <g fill="none" stroke="var(--glow-bright)" strokeLinejoin="round" filter="url(#glowTight)">
                <polygon points="280,70 112,268 280,516 448,268" strokeWidth="2.4" opacity="1" />
                <path d="M112 268 L280 326 L448 268" strokeWidth="1.7" opacity="0.85" />
                <path d="M280 70 L280 326" strokeWidth="1" opacity="0.4" />
            </g>

            {/* orbital ring, front arc over the crystal */}
            <g transform="translate(280 300) rotate(-14)">
                <path
                    d="M -238 0 A 238 56 0 0 0 238 0"
                    fill="none"
                    stroke="var(--glow-bright)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    filter="url(#glowTight)"
                />
            </g>
        </svg>
    );
}
