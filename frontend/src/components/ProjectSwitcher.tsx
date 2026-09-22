import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, Settings2 } from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { teamDetails, teamList, type Team } from '../api';
import { CLASS_MENU_ITEM, TEAM_NAMES } from '../lib/constant';
import { teamPath } from '../lib/navigation';
import { LED } from './ui/LED';
import { MonoLabel } from './ui/MonoLabel';

export function ProjectSwitcher({ teamId }: { teamId: number })
{
    const { pathname } = useLocation();

    const [ openedAt, setOpenedAt ] = useState<string | null>(null);
    const [ teams, setTeams ] = useState<Team[] | null>(null);
    const [ fetched, setFetched ] = useState({ id: 0, name: '' });

    const root = useRef<HTMLDivElement>(null);

    const open = openedAt === pathname;
    const name = TEAM_NAMES.get(teamId) ?? (fetched.id === teamId ? fetched.name : '');

    useEffect(() =>
    {
        if (teamId === 0 || TEAM_NAMES.has(teamId))
        {
            return;
        }

        let active = true;

        teamDetails(teamId)
            .then((team) =>
            {
                TEAM_NAMES.set(team.id, team.name);

                if (active)
                {
                    setFetched({ id: team.id, name: team.name });
                }
            })
            .catch(() => { });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }

        if (teams === null)
        {
            teamList()
                .then((payload) =>
                {
                    for (const team of payload.teams)
                    {
                        TEAM_NAMES.set(team.id, team.name);
                    }

                    setTeams(payload.teams);
                })
                .catch(() => setTeams([ ]));
        }

        const onPointerDown = (event: PointerEvent) =>
        {
            if (!root.current?.contains(event.target as Node))
            {
                setOpenedAt(null);
            }
        };

        const onKeyDown = (event: KeyboardEvent) =>
        {
            if (event.key === 'Escape')
            {
                setOpenedAt(null);
            }
        };

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);

        return () =>
        {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [ open, teams ]);

    return (
        <div className="relative min-w-0" ref={ root }>
            <button
                className="flex h-9 max-w-full items-center gap-2 rounded-control border border-edge-strong bg-raised px-3 text-sm font-medium text-ink"
                type="button"
                aria-haspopup="menu"
                aria-expanded={ open }
                onClick={ () => setOpenedAt(open ? null : pathname) }
            >
                <span className="truncate">{ teamId === 0 ? 'Projects' : name === '' ? `Team ${ teamId }` : name }</span>

                { teamId !== 0 && (
                    <span className="rounded-[4px] border border-live-edge px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em] text-live">TEAM</span>
                ) }

                <ChevronDown className="shrink-0 text-ink-3" size={ 12 } aria-hidden="true" />
            </button>

            { open && (
                <div className="absolute top-full left-0 z-20 mt-2 flex min-w-64 flex-col gap-0.5 rounded-panel border border-edge bg-panel p-1.5 shadow-lift" role="menu">
                    <MonoLabel className="px-2.5 pt-1.5 pb-1">Projects</MonoLabel>

                    { teams === null && <span className="px-2.5 py-2 text-sm text-ink-3">Loading...</span> }

                    { teams !== null && teams.length === 0 && <span className="px-2.5 py-2 text-sm text-ink-3">No projects yet.</span> }

                    { teams?.map((team) => (
                        <Link
                            key={ team.id }
                            className={ team.id === teamId ? `${ CLASS_MENU_ITEM } bg-raised text-ink` : CLASS_MENU_ITEM }
                            role="menuitem"
                            aria-current={ team.id === teamId ? 'true' : undefined }
                            to={ teamPath(team.id) }
                        >
                            <LED state={ team.id === teamId ? 'live' : 'off' } />
                            <span className="truncate">{ team.name }</span>
                        </Link>
                    )) }

                    <span className="my-1 border-t border-edge-soft" aria-hidden="true" />

                    { teamId !== 0 && (
                        <Link className={ CLASS_MENU_ITEM } role="menuitem" to={ teamPath(teamId, 'settings') }>
                            <Settings2 size={ 14 } aria-hidden="true" />
                            Team settings
                        </Link>
                    ) }

                    <Link className={ CLASS_MENU_ITEM } role="menuitem" to="/dashboard">
                        <LayoutGrid size={ 14 } aria-hidden="true" />
                        All projects
                    </Link>
                </div>
            ) }
        </div>
    );
}
