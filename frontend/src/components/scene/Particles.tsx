import { noise } from './projection';

/**
 * Suspended dust. Density is low on purpose -- the brief warns against
 * excessive particles, and anything busy here competes with the sign-in copy.
 *
 * Each particle carries its own duration and delay as inline custom properties
 * so a single CSS keyframe animates all of them out of step; the motion is
 * disabled wholesale under prefers-reduced-motion in the stylesheet.
 */

const PARTICLES = Array.from({ length: 26 }, (_, i) => ({
    left: noise(i * 3 + 2) * 100,
    top: noise(i * 5 + 9) * 92,
    size: 1 + noise(i * 13 + 4) * 2.2,
    opacity: 0.12 + noise(i * 19 + 6) * 0.4,
    duration: 16 + noise(i * 29 + 8) * 22,
    delay: noise(i * 37 + 11) * -30
}));

export function Particles()
{
    return (
        <div className="particles">
            { PARTICLES.map((particle, i) => (
                <span
                    key={ `p-${ i }` }
                    className="particles__dot"
                    style={ {
                        left: `${ particle.left }%`,
                        top: `${ particle.top }%`,
                        inlineSize: `${ particle.size }px`,
                        blockSize: `${ particle.size }px`,
                        opacity: particle.opacity,
                        animationDuration: `${ particle.duration }s`,
                        animationDelay: `${ particle.delay }s`
                    } }
                />
            )) }
        </div>
    );
}
