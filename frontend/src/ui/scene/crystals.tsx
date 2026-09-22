import { useAnimationFrame, useReducedMotion } from 'motion/react';
import { useRef } from 'react';

import { CRYSTAL_MAIN_PULSE, CRYSTAL_SWARM } from '@/libs/constant';
import { Stack } from '@/ui/stack';

import { Crystal } from './crystal';
import { Debris } from './debris';
import { drift } from './projection';
import { useRotation } from './use-rotation';

// The main diamond with its orbits and debris, and a swarm of smaller ones around it. One
// clock turns them all; each smaller diamond runs it at its own speed, direction and phase,
// wanders the screen on its own slow path, and grows and shrinks on its own beat. Frames write
// each diamond's `translate` and `scale` directly, so React does not render once per frame.
export function Crystals() {
    const angle = useRotation();
    const still = useReducedMotion();
    const boxes = useRef<(HTMLElement | null)[]>([]);
    const main = useRef<HTMLElement>(null);

    useAnimationFrame((time) => {
        if (still) {
            return;
        }

        const seconds = time / 1000;
        const beat = (p: { amount: number; frequency: number; phase: number }) =>
            (1 + p.amount * Math.sin(p.frequency * seconds + p.phase)).toFixed(3);

        if (main.current) {
            main.current.style.scale = beat(CRYSTAL_MAIN_PULSE);
        }

        CRYSTAL_SWARM.forEach((crystal, i) => {
            const { x, y } = drift({ x: 0, y: 0, waves: crystal.waves }, seconds);
            const box = boxes.current[i];

            if (box) {
                box.style.translate = `calc(-50% + ${x.toFixed(2)}vw) calc(-50% + ${y.toFixed(2)}vh)`;
                box.style.scale = beat(crystal.pulse);
            }
        });
    });

    return (
        <>
            <Stack
                direction="Vertical"
                ref={main}
                className="absolute top-[6%] left-1/2 aspect-square w-[min(72vw,20rem)] -translate-x-1/2 animate-drift motion-reduce:animate-none sm:w-[min(60vw,26rem)] lg:w-[min(42vw,40rem)]">
                <Stack
                    direction="Vertical"
                    className="absolute inset-0 animate-hue motion-reduce:animate-none">
                    <Debris />
                    <Crystal yaw={angle} />
                </Stack>
            </Stack>

            {CRYSTAL_SWARM.map((crystal, i) => (
                <Stack
                    key={crystal.key}
                    ref={(box) => {
                        boxes.current[i] = box;
                    }}
                    direction="Vertical"
                    className="absolute aspect-square -translate-x-1/2 -translate-y-1/2"
                    style={{
                        // The diamond draws its edges and glow in --glow-bright and its lit facets in
                        // --facet-hi; both take this diamond's hue.
                        ['--glow-bright' as string]: crystal.hue,
                        ['--facet-hi' as string]: `color-mix(in srgb, ${crystal.hue} 45%, var(--muted-foreground))`,
                        left: `${crystal.left}%`,
                        top: `${crystal.top}%`,
                        width: `min(${crystal.size}rem, ${crystal.size * 2.4}vw)`,
                        opacity: crystal.opacity,
                    }}>
                    <Crystal yaw={angle * crystal.speed + crystal.phase} orbits={false} />
                </Stack>
            ))}
        </>
    );
}
