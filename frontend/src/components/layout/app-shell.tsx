import { Outlet, useLocation } from 'react-router';

import { Scene } from '@/components/scene/scene';
import { PAGE_WIDTH } from '@/lib/constant';
import { activeTeamId } from '@/lib/navigation';
import { readAccessToken } from '@/lib/session';

import { AppHeader } from './app-header';

export function AppShell() {
    const { pathname } = useLocation();

    if (readAccessToken() === null) {
        return (
            <div className="relative isolate min-h-dvh">
                <Scene />

                <main className="grid min-h-dvh content-center px-4 py-10">
                    <Outlet />
                </main>
            </div>
        );
    }

    return (
        <div className="relative isolate min-h-dvh">
            <AppHeader />

            <main
                className={`${PAGE_WIDTH} grid min-w-0 content-start gap-6 px-4 pb-16 sm:px-6 ${activeTeamId(pathname) === 0 ? 'pt-24' : 'pt-32'}`}
            >
                <Outlet />
            </main>
        </div>
    );
}
