import { Crystal } from './Crystal';
import { Debris } from './Debris';
import { Terrain } from './Terrain';

/**
 * Full-bleed background art. Purely decorative, so the whole layer is hidden
 * from assistive technology and ignores pointer events.
 */
export function Scene()
{
    return (
        <div className="scene" aria-hidden="true">
            <div className="scene__glow" />

            <div className="scene__object">
                <Debris />
                <Crystal />
            </div>

            <Terrain />
        </div>
    );
}
