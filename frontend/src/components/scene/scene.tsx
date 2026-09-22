import { CLASS_SCENE_PALETTE, CLASS_SCENE_ROOT } from '../../lib/constant';
import { Crystal } from './Crystal';
import { Debris } from './Debris';
import { Lattice } from './Lattice';
import { Particles } from './Particles';
import { Terrain } from './Terrain';

export function Scene()
{
    return (
        <div className={ `${ CLASS_SCENE_ROOT } ${ CLASS_SCENE_PALETTE }` } aria-hidden="true">
            <div className="absolute -top-[10%] left-1/2 aspect-square w-[min(120vw,60rem)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--glow-bright)_28%,transparent)_0%,transparent_62%)]" />

            <Particles />

            <Lattice />

            <Terrain />

            <div className="absolute top-[6%] left-1/2 aspect-square w-[min(72vw,20rem)] -translate-x-1/2 animate-drift motion-reduce:animate-none sm:w-[min(60vw,26rem)] lg:w-[min(42vw,40rem)]">
                <Debris />
                <Crystal />
            </div>

            <div className="absolute inset-0 bg-[radial-gradient(70%_46%_at_50%_76%,color-mix(in_srgb,var(--nura-bg)_82%,transparent)_0%,transparent_70%)]" />
        </div>
    );
}
