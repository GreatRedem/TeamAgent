import { Outlet, useLocation } from 'react-router';
import { PAGE_WIDTH } from '@/libs/constant';
import { activeTeamId } from '@/libs/navigation';
import { readAccessToken } from '@/libs/session';
import { Scene } from '@/ui/scene/scene';
import { Stack } from '@/ui/stack';
import { AppHeader } from './app-header';

export function AppShell() {
    const { pathname } = useLocation();

    if (readAccessToken() === null) {
        return (
            <Stack direction="Vertical" className="relative isolate min-h-dvh">
                <Scene />

                <Stack
                    direction="Vertical"
                    as="main"
                    className="min-h-dvh justify-center px-4 py-10">
                    <Outlet />
                </Stack>
            </Stack>
        );
    }

    return (
        <Stack direction="Vertical" className="relative isolate min-h-dvh">
            <AppHeader />

            <Stack
                direction="Vertical"
                as="main"
                className={`${PAGE_WIDTH} min-w-0 gap-6 px-4 pb-16 sm:px-6 ${activeTeamId(pathname) === 0 ? 'pt-24' : 'pt-32'}`}>
                <Outlet />
            </Stack>
        </Stack>
    );
}
