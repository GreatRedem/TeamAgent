import { SCENE_PALETTE, SCENE_ROOT } from '@/libs/constant';
import { Stack } from '@/ui/stack';
import { Crystal } from './crystal';
import { Debris } from './debris';
import { Lattice } from './lattice';
import { Particles } from './particles';
import { Terrain } from './terrain';

export function Scene() {
    return (
        <Stack direction="Vertical" className={`${SCENE_ROOT} ${SCENE_PALETTE}`} aria-hidden="true">
            <Stack
                direction="Vertical"
                className="absolute -top-[10%] left-1/2 aspect-square w-[min(120vw,60rem)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--glow-bright)_28%,transparent)_0%,transparent_62%)]"
            />

            <Particles />

            <Lattice />

            <Terrain />

            <Stack
                direction="Vertical"
                className="absolute top-[6%] left-1/2 aspect-square w-[min(72vw,20rem)] -translate-x-1/2 animate-drift motion-reduce:animate-none sm:w-[min(60vw,26rem)] lg:w-[min(42vw,40rem)]">
                <Debris />
                <Crystal />
            </Stack>

            <Stack
                direction="Vertical"
                className="absolute inset-0 bg-[radial-gradient(70%_46%_at_50%_76%,color-mix(in_srgb,var(--nura-bg)_82%,transparent)_0%,transparent_70%)]"
            />
        </Stack>
    );
}
