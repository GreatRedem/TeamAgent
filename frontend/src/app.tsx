import { Route, Routes } from 'react-router';

import { AppShell } from '@/components/layout/app-shell';
import { Agent } from '@/pages/agent';
import { NotFound } from '@/pages/not-found';
import { ProfilePage } from '@/pages/profile-page';
import { Project } from '@/pages/project';
import { Projects } from '@/pages/projects';
import { SignIn } from '@/pages/sign-in';

export function App()
{
    return (
        <Routes>
            <Route element={ <AppShell /> }>
                <Route index element={ <SignIn /> } />
                <Route path="dashboard" element={ <Projects /> } />
                <Route path="dashboard/team/:id/:tab?" element={ <Project /> } />
                <Route path="dashboard/team/:id/profile/:profileId" element={ <ProfilePage /> } />
                <Route path="dashboard/team/:id/agent/:agentId" element={ <Agent /> } />
                <Route path="*" element={ <NotFound /> } />
            </Route>
        </Routes>
    );
}
