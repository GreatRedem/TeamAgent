import { Route, Routes } from 'react-router';

import { Layout } from './components/Layout';

import { Dashboard } from './pages/Dashboard';
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
                <Route path="dashboard/team/:id" element={ <Team /> } />
                <Route path="dashboard/team/:id/profile/:profileId" element={ <Profile /> } />
                <Route path="*" element={ <NotFound /> } />
            </Route>
        </Routes>
    );
}
