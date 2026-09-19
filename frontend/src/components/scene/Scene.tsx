import { Crystal } from './Crystal';
import { Debris } from './Debris';
import { Lattice } from './Lattice';
import { Particles } from './Particles';
import { Terrain } from './Terrain';

/**
 * Full-bleed background art, built as five depth layers: atmosphere, dust, the
 * far mathematical lattice, the terrain, and the hero crystal.
 *
 * Purely decorative, so the whole layer is hidden from assistive technology and
 * ignores pointer events. `scene__quiet` is the negative space the sign-in copy
 * sits in -- it darkens whatever passes behind the text so the geometry never
 * competes with the one action on the page.
 */
export function Scene()
{
    return (
        <div className="scene" aria-hidden="true">
            <div className="scene__glow" />

            <Particles />

            <Lattice />

            <Terrain />

            <div className="scene__object">
                <Debris />
                <Crystal />
            </div>

            <div className="scene__quiet" />
        </div>
    );
}
