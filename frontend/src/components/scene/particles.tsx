import { SCENE_PARTICLES } from '@/lib/constant';

export function Particles() {
    return (
        <div className="absolute inset-0">
            {SCENE_PARTICLES.map((particle, i) => (
                <span
                    key={`p-${i}`}
                    className="absolute animate-float rounded-full bg-[var(--glow-bright)] motion-reduce:animate-none [&:nth-child(n+13)]:hidden sm:[&:nth-child(n+13)]:block"
                    style={{
                        left: `${particle.left}%`,
                        top: `${particle.top}%`,
                        inlineSize: `${particle.size}px`,
                        blockSize: `${particle.size}px`,
                        opacity: particle.opacity,
                        animationDuration: `${particle.duration}s`,
                        animationDelay: `${particle.delay}s`,
                    }}
                />
            ))}
        </div>
    );
}
