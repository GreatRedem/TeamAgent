import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, Settings2 } from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { teamDetails, teamList, type Team } from '../lib/api';
import { LED } from './LED';
import { MonoLabel } from './MonoLabel';
import { teamPath } from './RailNav';

/**
 * Names already fetched, so moving between a team's destinations does not
 * re-ask for the same name each time.
 *
 * Module-level rather than state: a cache that lived in the component would be
 * refilled on every remount, and the one thing being cached is a short string
 * that changes only when someone renames a team.
 */
const names = new Map<number, string>();

/** On sign-out, so the next account does not see the last one's names. */
export function forgetTeamNames(): void
{
    names.clear();
}

const ITEM = 'flex h-10 items-center gap-2.5 rounded-control px-2.5 text-sm text-ink-2 no-underline hover:bg-raised hover:text-ink';

/**
 * The active project, always visible in the header: name, `TEAM` badge, caret.
 * Opens the list of teams, plus the way to this team's settings and back to
 * all projects.
 *
 * "Open" is stored as the path it was opened on, so navigating anywhere closes
 * it without an effect that sets state. Outside clicks and Escape close it too.
 */
export function ProjectSwitcher({ teamId }: { teamId: number })
{
    const { pathname } = useLocation();

    const [ openedAt, setOpenedAt ] = useState<string | null>(null);
    const [ teams, setTeams ] = useState<Team[] | null>(null);

    // Carries the id it belongs to, so a name fetched for the team you just
    // left cannot be shown against the one you just opened.
    const [ fetched, setFetched ] = useState({ id: 0, name: '' });

    const root = useRef<HTMLDivElement>(null);

    const open = openedAt === pathname;
    const name = names.get(teamId) ?? (fetched.id === teamId ? fetched.name : '');

    useEffect(() =>
    {
        if (teamId === 0 || names.has(teamId))
        {
            return;
        }

        let active = true;

        teamDetails(teamId)
            .then((team) =>
            {
                names.set(team.id, team.name);

                if (active)
                {
                    setFetched({ id: team.id, name: team.name });
                }
            })
            // Silent: the page itself reports a team it cannot load, and a
            // second copy of that error in the chrome helps nobody.
            .catch(() => { /* the name simply stays blank */ });

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

        // The list is fetched the first time the menu opens, not on every
        // page: it is only needed once someone reaches for another project.
        if (teams === null)
        {
            teamList()
                .then((payload) =>
                {
                    for (const team of payload.teams)
                    {
                        names.set(team.id, team.name);
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
                {/* Until the name arrives the id is still true, and is better
                    than a box that changes width under the eye. */}
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
                            className={ team.id === teamId ? `${ ITEM } bg-raised text-ink` : ITEM }
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
                        <Link className={ ITEM } role="menuitem" to={ teamPath(teamId, 'settings') }>
                            <Settings2 size={ 14 } aria-hidden="true" />
                            Team settings
                        </Link>
                    ) }

                    <Link className={ ITEM } role="menuitem" to="/dashboard">
                        <LayoutGrid size={ 14 } aria-hidden="true" />
                        All projects
                    </Link>
                </div>
            ) }
        </div>
    );
}
