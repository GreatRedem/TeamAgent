import { LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';

import { Brand } from './Brand';
import { ProjectSwitcher, forgetTeamNames } from './ProjectSwitcher';
import { activeTeamId } from './RailNav';
import { clearAccessToken, readAccessToken } from '../lib/session';

/**
 * The detached bar every signed-in screen sits under: the mark, the project
 * you are in, and the way out.
 *
 * It floats -- inset from the edges, lifted by `--nura-shadow` -- because the
 * project it names is the point. A bar welded to the edges reads as furniture;
 * one that floats reads as a thing to look at. It stays put while the page
 * scrolls, since "which project am I in" does not stop being asked at the
 * bottom of a long list.
 */
export function FloatingHeader()
{
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const teamId = activeTeamId(pathname);
    const signedIn = readAccessToken() !== null;

    const signOut = () =>
    {
        clearAccessToken();
        forgetTeamNames();

        void navigate('/', { replace: true });
    };

    return (
        <div className="flex h-14 items-center gap-3.5 rounded-panel border border-edge bg-panel px-3.5 shadow-float lg:h-16">
            <Brand to={ signedIn ? '/dashboard' : '/' } />

            { signedIn && (
                <>
                    <span className="h-6 w-px shrink-0 bg-edge" aria-hidden="true" />

                    <ProjectSwitcher teamId={ teamId } />

                    <span className="grow" />

                    <button className="ghost gap-2 border-transparent text-ink-3" type="button" onClick={ signOut }>
                        <LogOut size={ 14 } aria-hidden="true" />
                        <span className="hidden sm:inline">Sign out</span>
                    </button>
                </>
            ) }
        </div>
    );
}
