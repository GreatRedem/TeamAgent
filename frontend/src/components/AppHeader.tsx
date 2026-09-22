import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router';

import {
    CLASS_GHOST,
    CLASS_NAV_LINK,
    DESTINATIONS,
    HEADER_IDLE_DELAY,
    HEADER_LIFT_TRAVEL,
    HEADER_OPEN_ZONE,
    HEADER_WIDTH,
    TEAM_NAMES
} from '../lib/constant';
import { activeTeamId, teamPath } from '../lib/navigation';
import { clearAccessToken } from '../lib/session';
import { ProjectSwitcher } from './ProjectSwitcher';
import { Brand } from './ui/Brand';

export function AppHeader()
{
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const teamId = activeTeamId(pathname);

    const [ open, setOpen ] = useState(true);

    const host = useRef<HTMLDivElement>(null);
    const idle = useRef(0);

    useEffect(() =>
    {
        if (!window.matchMedia('(hover: hover)').matches)
        {
            return;
        }

        let lastY = Number.POSITIVE_INFINITY;
        let rise = 0;

        const rest = () =>
        {
            window.clearTimeout(idle.current);

            idle.current = window.setTimeout(() =>
            {
                const panel = host.current;

                if (panel === null || panel.matches(':hover') || panel.contains(document.activeElement))
                {
                    return;
                }

                setOpen(false);
            }, HEADER_IDLE_DELAY);
        };

        const onMove = (event: PointerEvent) =>
        {
            rise = event.clientY < lastY ? rise + (lastY - event.clientY) : 0;

            lastY = event.clientY;

            if (event.clientY < HEADER_OPEN_ZONE || rise > HEADER_LIFT_TRAVEL)
            {
                setOpen(true);
            }

            rest();
        };

        window.addEventListener('pointermove', onMove);

        rest();

        return () =>
        {
            window.removeEventListener('pointermove', onMove);
            window.clearTimeout(idle.current);
        };
    }, []);

    const signOut = () =>
    {
        clearAccessToken();
        TEAM_NAMES.clear();

        void navigate('/', { replace: true });
    };

    return (
        <header className="pointer-events-none fixed inset-x-0 top-0 z-30 px-4 pt-3 lg:px-6">
            <div
                className={ [
                    'absolute top-1.5 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-pill bg-edge-strong',
                    'transition-opacity duration-300 ease-out motion-reduce:transition-none',
                    open ? 'opacity-0' : 'opacity-100'
                ].join(' ') }
                aria-hidden="true"
            />

            <div
                ref={ host }
                className={ [
                    'pointer-events-auto mx-auto flex flex-col overflow-hidden rounded-panel border border-edge bg-panel shadow-float',
                    'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
                    HEADER_WIDTH,
                    open ? 'translate-y-0 opacity-100' : '-translate-y-[calc(100%+1.5rem)] opacity-0'
                ].join(' ') }
                onPointerEnter={ () => setOpen(true) }
                onFocus={ () => setOpen(true) }
            >
                <div className="flex h-14 items-center gap-3.5 px-3.5">
                    <Brand to="/dashboard" />

                    <span className="h-6 w-px shrink-0 bg-edge" aria-hidden="true" />

                    <ProjectSwitcher teamId={ teamId } />

                    <span className="grow" />

                    <button className={ `${ CLASS_GHOST } gap-2 border-transparent text-ink-3` } type="button" onClick={ signOut }>
                        <LogOut size={ 14 } aria-hidden="true" />
                        <span className="hidden sm:inline">Sign out</span>
                    </button>
                </div>

                { teamId !== 0 && (
                    <nav className="flex h-12 items-center gap-1 overflow-x-auto border-t border-edge-soft px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Project">
                        { DESTINATIONS.map(({ id, label, icon: Icon }) => (
                            <NavLink
                                key={ id }
                                to={ teamPath(teamId, id) }
                                end
                                className={ ({ isActive }) => [
                                    CLASS_NAV_LINK,
                                    isActive ? 'bg-raised text-ink' : 'text-ink-2 hover:text-ink'
                                ].join(' ') }
                            >
                                { ({ isActive }) => (
                                    <>
                                        <Icon size={ 16 } className={ isActive ? 'text-live' : undefined } aria-hidden="true" />
                                        { label }
                                    </>
                                ) }
                            </NavLink>
                        )) }
                    </nav>
                ) }
            </div>
        </header>
    );
}
