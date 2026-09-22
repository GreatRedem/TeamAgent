import { Route, Routes } from 'react-router';

import { Layout } from './components/Layout';

import { Dashboard } from './pages/Dashboard';
import { Agent } from './pages/Agent';
import { NotFound } from './pages/NotFound';
import { Profile } from './pages/Profile';
import { SignIn } from './pages/SignIn';
import { Team } from './pages/Team';

export function App()
{
    return (
        <Routes>
            <Route element={ <Layout /> }>
                <Route index element={ <SignIn /> } />
                <Route path="dashboard" element={ <Dashboard /> } />
                {/* The destination is a url segment, not component state, so a
                    deep link to /agents or /activity opens on that screen. */}
                <Route path="dashboard/team/:id/:tab?" element={ <Team /> } />
                <Route path="dashboard/team/:id/profile/:profileId" element={ <Profile /> } />
                <Route path="dashboard/team/:id/agent/:agentId" element={ <Agent /> } />
                <Route path="*" element={ <NotFound /> } />
            </Route>
        </Routes>
    );
}
