import type { LucideIcon } from 'lucide-react';
import { Activity, Bot, Layers, LayoutGrid, MessageSquare } from 'lucide-react';
import { NavLink } from 'react-router';

import { MonoLabel } from './MonoLabel';

/**
 * The five places a project has. The rail on desktop and the bar on mobile
 * are the same list, so a destination cannot exist on one and not the other.
 */
const DESTINATIONS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: '', label: 'Overview', icon: LayoutGrid },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'bots', label: 'Bots', icon: MessageSquare },
    { id: 'models', label: 'Models', icon: Layers },
    { id: 'activity', label: 'Activity', icon: Activity }
];

/**
 * The team the current url is about, or 0 on a page that is not about one.
 *
 * Read from the path rather than `useParams`, which returns only the params of
 * the route that matched -- the shell sits above `:id`, so it never sees it.
 */
export function activeTeamId(pathname: string): number
{
    const match = /^\/dashboard\/team\/(\d+)/.exec(pathname);

    return match ? Number(match[1]) : 0;
}

export function teamPath(teamId: number, destination = ''): string
{
    return `/dashboard/team/${ teamId }${ destination === '' ? '' : `/${ destination }` }`;
}

/** Desktop: a 216px panel beside the content. Hidden below `lg`. */
export function RailNav({ teamId }: { teamId: number })
{
    return (
        <nav className="sticky top-24 hidden w-[216px] shrink-0 flex-col gap-0.5 self-start rounded-panel border border-edge bg-panel p-2.5 lg:flex" aria-label="Project">
            <MonoLabel className="px-2.5 pt-2 pb-2.5">Project</MonoLabel>

            { DESTINATIONS.map(({ id, label, icon: Icon }) => (
                <NavLink
                    key={ id }
                    to={ teamPath(teamId, id) }
                    // Exact match, or Overview would light up under every destination.
                    end
                    className={ ({ isActive }) => [
                        'flex h-10 items-center gap-2.5 rounded-control px-2.5 text-sm no-underline',
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
    );
}

/** Mobile: a bar fixed to the bottom edge, 44px+ targets. Hidden from `lg`. */
export function TabBar({ teamId }: { teamId: number })
{
    return (
        <nav className="fixed inset-x-0 bottom-0 z-10 flex gap-1 border-t border-edge-soft bg-well px-3.5 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:hidden" aria-label="Project">
            { DESTINATIONS.map(({ id, label, icon: Icon }) => (
                <NavLink
                    key={ id }
                    to={ teamPath(teamId, id) }
                    end
                    className={ ({ isActive }) => [
                        'flex h-13 grow flex-col items-center justify-center gap-1 rounded-panel text-[10px] no-underline',
                        isActive ? 'text-live' : 'text-ink-3'
                    ].join(' ') }
                >
                    <Icon size={ 18 } aria-hidden="true" />
                    { label }
                </NavLink>
            )) }
        </nav>
    );
}
