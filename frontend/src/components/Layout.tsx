import { Outlet, useLocation } from 'react-router';

import { FloatingHeader } from './FloatingHeader';
import { RailNav, TabBar, activeTeamId } from './RailNav';
import { Scene } from './scene/Scene';

/**
 * The shell every page sits in: the scene behind, the floating header on top,
 * the rail beside the page on desktop and the tab bar under it on mobile.
 *
 * The rail and the bar only exist inside a project; the sign-in page and the
 * project list have nowhere for them to point.
 *
 * `isolate` puts the shell on its own stacking context so the fixed scene can
 * never paint over a dropdown or the sticky header.
 */
export function Layout()
{
    const teamId = activeTeamId(useLocation().pathname);

    return (
        <div className="relative isolate min-h-dvh">
            <Scene />

            <header className="sticky top-0 z-10 px-4 pt-4 lg:px-6">
                <FloatingHeader />
            </header>

            <div className="flex gap-5 px-4 pt-4 pb-24 lg:px-6 lg:pb-6">
                { teamId !== 0 && <RailNav teamId={ teamId } /> }

                <main className="grid min-w-0 grow content-start gap-4">
                    <Outlet />
                </main>
            </div>

            { teamId !== 0 && <TabBar teamId={ teamId } /> }
        </div>
    );
}
