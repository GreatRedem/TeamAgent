import { Outlet } from 'react-router';

import { Brand } from './Brand';
import { Scene } from './scene/Scene';

export function Layout()
{
    return (
        <div className="shell">
            <Scene />

            <header className="shell__header">
                <Brand />
            </header>

            <main className="shell__main">
                <Outlet />
            </main>
        </div>
    );
}
