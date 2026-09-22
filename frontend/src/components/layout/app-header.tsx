import { LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { cn } from '@/libs/cn';
import {
    DESTINATIONS,
    HEADER_IDLE_DELAY,
    HEADER_LIFT_TRAVEL,
    HEADER_OPEN_ZONE,
    TEAM_NAMES,
} from '@/libs/constant';
import { activeTeamId, teamPath } from '@/libs/navigation';
import { clearAccessToken } from '@/libs/session';
import { Brand } from '@/ui/brand';
import { Button } from '@/ui/button';
import { Separator } from '@/ui/separator';
import { Stack } from '@/ui/stack';

import { ProjectSwitcher } from './project-switcher';

export function AppHeader() {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const teamId = activeTeamId(pathname);

    const [open, setOpen] = useState(true);

    const host = useRef<HTMLElement>(null);
    const idle = useRef(0);

    useEffect(() => {
        if (!window.matchMedia('(hover: hover)').matches) {
            return;
        }

        let lastY = Number.POSITIVE_INFINITY;
        let rise = 0;

        const rest = () => {
            window.clearTimeout(idle.current);

            idle.current = window.setTimeout(() => {
                const panel = host.current;

                if (
                    panel === null ||
                    panel.matches(':hover') ||
                    panel.contains(document.activeElement)
                ) {
                    return;
                }

                setOpen(false);
            }, HEADER_IDLE_DELAY);
        };

        const onMove = (event: PointerEvent) => {
            rise = event.clientY < lastY ? rise + (lastY - event.clientY) : 0;
            lastY = event.clientY;

            if (event.clientY < HEADER_OPEN_ZONE || rise > HEADER_LIFT_TRAVEL) {
                setOpen(true);
            }

            rest();
        };

        window.addEventListener('pointermove', onMove);

        rest();

        return () => {
            window.removeEventListener('pointermove', onMove);
            window.clearTimeout(idle.current);
        };
    }, []);

    // Pointing at the bar or tabbing into it brings it back.
    useEffect(() => {
        const panel = host.current;

        if (panel === null) {
            return;
        }

        const show = () => setOpen(true);

        panel.addEventListener('pointerenter', show);
        panel.addEventListener('focusin', show);

        return () => {
            panel.removeEventListener('pointerenter', show);
            panel.removeEventListener('focusin', show);
        };
    }, []);

    const signOut = () => {
        clearAccessToken();
        TEAM_NAMES.clear();

        void navigate('/', { replace: true });
    };

    return (
        <Stack
            direction="Vertical"
            as="header"
            className="pointer-events-none fixed inset-x-0 top-0 z-30 px-4 pt-3 sm:px-6">
            {/* Idle, the bar stays put and narrows to a pill; it widens again when wanted. */}
            <Stack
                direction="Vertical"
                ref={host}
                className={cn(
                    'pointer-events-auto mx-auto w-full overflow-hidden rounded-xl border bg-card/95 shadow-float backdrop-blur-xl',
                    'transition-[max-width] duration-300 ease-out motion-reduce:transition-none',
                    // Expanded, the bar is 32px narrower than the page column under it.
                    open ? 'max-w-[calc(var(--container-5xl)-2rem)]' : 'max-w-sm',
                )}>
                <Stack direction="Horizontal" className="h-14 items-center gap-2 px-3">
                    <Brand to="/dashboard" />

                    <Separator orientation="vertical" className="mx-1 !h-5" />

                    <ProjectSwitcher teamId={teamId} />

                    <Stack direction="Horizontal" as="span" className="grow" />

                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground [&>[data-slot=button-message]]:hidden sm:[&>[data-slot=button-message]]:inline"
                        aria-label="Sign out"
                        onClick={signOut}
                        icon={<LogOut />}
                        message="Sign out"
                    />
                </Stack>

                {teamId !== 0 && (
                    <Stack
                        direction="Vertical"
                        className={cn(
                            'overflow-hidden transition-[max-height,opacity] duration-300 ease-out motion-reduce:transition-none',
                            open ? 'max-h-14 opacity-100' : 'max-h-0 opacity-0',
                        )}>
                        <Stack
                            direction="Horizontal"
                            as="nav"
                            className="[scrollbar-width:none] gap-1 overflow-x-auto border-t px-2 py-1.5 [&::-webkit-scrollbar]:hidden"
                            aria-label="Project sections">
                            {DESTINATIONS.map(({ id, label, icon: Icon }) => (
                                <NavLink
                                    key={id}
                                    to={teamPath(teamId, id)}
                                    end
                                    className={({ isActive }) =>
                                        cn(
                                            'flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-control no-underline transition-colors',
                                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                            isActive
                                                ? 'bg-accent font-medium text-accent-foreground'
                                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                                        )
                                    }>
                                    {({ isActive }) => (
                                        <>
                                            <Icon
                                                size={16}
                                                className={isActive ? 'text-primary' : undefined}
                                                aria-hidden="true"
                                            />
                                            {label}
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </Stack>
                    </Stack>
                )}
            </Stack>
        </Stack>
    );
}
