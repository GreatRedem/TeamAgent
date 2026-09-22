import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';

import { ApiError, teamDetails, teamUpdate, type Team } from '@/api';
import { TEAM_TITLES } from '@/lib/constant';
import { teamPath } from '@/lib/navigation';
import { clearAccessToken, readAccessToken } from '@/lib/session';
import { ActivityPanel } from '@/components/project/activity-panel';
import { AgentsPanel } from '@/components/project/agents-panel';
import { BotsPanel } from '@/components/project/bots-panel';
import { MachinePanel } from '@/components/project/machine-panel';
import { ModelsPanel } from '@/components/project/models-panel';
import { PeoplePanel } from '@/components/project/people-panel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export function Project()
{
    const navigate = useNavigate();

    const { id, tab = '' } = useParams<{ id: string; tab?: string }>();

    const teamId = Number(id);

    const idInvalid = !Number.isInteger(teamId) || teamId < 1;
    const meta = TEAM_TITLES[tab];

    const [ team, setTeam ] = useState<Team | null>(null);
    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ saved, setSaved ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        if (readAccessToken() === null)
        {
            void navigate('/', { replace: true });

            return;
        }

        if (idInvalid)
        {
            return;
        }

        let active = true;

        teamDetails(teamId)
            .then((payload) =>
            {
                if (!active)
                {
                    return;
                }

                setTeam(payload);
                setName(payload.name);
                setDescription(payload.description);
            })
            .catch((cause: unknown) =>
            {
                if (!active)
                {
                    return;
                }

                if (cause instanceof ApiError && cause.status === 401)
                {
                    clearAccessToken();

                    void navigate('/', { replace: true });

                    return;
                }

                setError(cause instanceof ApiError ? cause.result : 'This project could not be loaded.');
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId, idInvalid, navigate ]);

    const save = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setSaved(false);
        setBusy(true);

        try
        {
            const updated = await teamUpdate(teamId, name.trim(), description.trim());

            setTeam(updated);
            setName(updated.name);
            setDescription(updated.description);
            setSaved(true);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The changes could not be saved.');
        }
        finally
        {
            setBusy(false);
        }
    }, [ teamId, name, description ]);

    if (!idInvalid && tab === 'activity')
    {
        return <Navigate to={ teamPath(teamId) } replace />;
    }

    if (idInvalid || meta === undefined)
    {
        return (
            <Alert variant="destructive">
                <AlertDescription>
                    { idInvalid ? 'That project address is not valid.' : 'There is no such section in this project.' }
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <>
            <PageHeader
                title={ meta.title }
                description={ team === null ? meta.description : team.description === '' ? meta.description : team.description }
            />

            { error !== null && <Alert variant="destructive"><AlertDescription>{ error }</AlertDescription></Alert> }

            { team === null && error === null && (
                <div className="grid gap-3">
                    <Skeleton className="h-40 rounded-xl" />
                    <Skeleton className="h-40 rounded-xl" />
                </div>
            ) }

            { team !== null && (tab === '' || tab === 'overview') && (
                <>
                    <MachinePanel />
                    <ActivityPanel teamId={ teamId } />
                </>
            ) }

            { team !== null && tab === 'agents' && <AgentsPanel teamId={ teamId } /> }

            { team !== null && tab === 'bots' && (
                <>
                    <BotsPanel teamId={ teamId } />
                    <PeoplePanel teamId={ teamId } />
                </>
            ) }

            { team !== null && tab === 'models' && <ModelsPanel teamId={ teamId } /> }

            { team !== null && tab === 'settings' && (
                <Card className="max-w-xl">
                    <CardHeader>
                        <CardTitle>Project details</CardTitle>
                        <CardDescription>
                            Created { new Date(team.created_at).toLocaleDateString() }, last changed { new Date(team.updated_at).toLocaleDateString() }.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form className="grid gap-5" onSubmit={ save }>
                            <Field label="Name">
                                { (fieldId) => (
                                    <Input
                                        id={ fieldId }
                                        value={ name }
                                        onChange={ (event) => { setName(event.target.value); setSaved(false); } }
                                        minLength={ 2 }
                                        maxLength={ 64 }
                                        required
                                    />
                                ) }
                            </Field>

                            <Field label="What it is for" hint="Optional.">
                                { (fieldId) => (
                                    <Input
                                        id={ fieldId }
                                        value={ description }
                                        onChange={ (event) => { setDescription(event.target.value); setSaved(false); } }
                                        maxLength={ 280 }
                                        placeholder="Support cover outside office hours"
                                    />
                                ) }
                            </Field>

                            <div className="flex items-center gap-3">
                                <Button type="submit" disabled={ busy }>{ busy ? 'Saving…' : 'Save changes' }</Button>

                                { saved && <output className="text-sm text-primary">Saved.</output> }
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) }
        </>
    );
}
