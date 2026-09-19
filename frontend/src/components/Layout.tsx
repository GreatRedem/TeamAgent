import { Sparkles } from 'lucide-react';
import { Link, Outlet } from 'react-router';

export function Layout()
{
    return (
        <main className="app">
            <section className="card">
                <h1 className="title">
                    <Link className="brand" to="/">
                        <Sparkles size={ 24 } aria-hidden="true" />
                        NuraAI
                    </Link>
                </h1>

                <Outlet />
            </section>
        </main>
    );
}
