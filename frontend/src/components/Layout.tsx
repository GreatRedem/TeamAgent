import { Outlet } from 'react-router';

import { readAccessToken } from '../lib/session';
import { AppHeader } from './AppHeader';
import { Scene } from './scene/Scene';

export function Layout()
{
    const signedIn = readAccessToken() !== null;

    if (!signedIn)
    {
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

            <main className="mx-auto grid w-full max-w-[64rem] min-w-0 content-start gap-4 px-4 pt-[7.5rem] pb-10 lg:px-6">
                <Outlet />
            </main>
        </div>
    );
}
