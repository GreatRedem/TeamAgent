import { SCENE_PALETTE, SCENE_ROOT } from '@/libs/constant';
import { Stack } from '@/ui/stack';
import { Crystals } from './crystals';
import { Lattice } from './lattice';
import { Particles } from './particles';

export function Scene() {
    return (
        <Stack direction="Vertical" className={`${SCENE_ROOT} ${SCENE_PALETTE}`} aria-hidden="true">
            <Stack
                direction="Vertical"
                className="absolute -top-[10%] left-1/2 aspect-square w-[min(120vw,60rem)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--glow-bright)_10%,transparent)_0%,transparent_55%)]"
            />

            <Particles />

            <Lattice />

            <Crystals />
        </Stack>
    );
}
