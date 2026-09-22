import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';

import { ApiError, type Team, teamDetails, teamUpdate } from '@/apis';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { ActivityPanel } from '@/components/project/activity-panel';
import { AgentsPanel } from '@/components/project/agents-panel';
import { BotsPanel } from '@/components/project/bots-panel';
import { MachinePanel } from '@/components/project/machine-panel';
import { ModelsPanel } from '@/components/project/models-panel';
import { PeoplePanel } from '@/components/project/people-panel';
import { TEAM_TITLES } from '@/libs/constant';
import { teamPath } from '@/libs/navigation';
import { clearAccessToken, readAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Input } from '@/ui/input';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function Project() {
    const navigate = useNavigate();

    const { id, tab = '' } = useParams<{ id: string; tab?: string }>();

    const teamId = Number(id);

    const idInvalid = !Number.isInteger(teamId) || teamId < 1;
    const meta = TEAM_TITLES[tab];

    const [team, setTeam] = useState<Team | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (readAccessToken() === null) {
            void navigate('/', { replace: true });

            return;
        }

        if (idInvalid) {
            return;
        }

        let active = true;

        teamDetails(teamId)
            .then((payload) => {
                if (!active) {
                    return;
                }

                setTeam(payload);
                setName(payload.name);
                setDescription(payload.description);
            })
            .catch((cause: unknown) => {
                if (!active) {
                    return;
                }

                if (cause instanceof ApiError && cause.status === 401) {
                    clearAccessToken();

                    void navigate('/', { replace: true });

                    return;
                }

                setError(
                    cause instanceof ApiError ? cause.result : 'This project could not be loaded.',
                );
            });

        return () => {
            active = false;
        };
    }, [teamId, idInvalid, navigate]);

    const save = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();

            setError(null);
            setSaved(false);
            setBusy(true);

            try {
                const updated = await teamUpdate(teamId, name.trim(), description.trim());

                setTeam(updated);
                setName(updated.name);
                setDescription(updated.description);
                setSaved(true);
            } catch (cause) {
                setError(
                    cause instanceof ApiError ? cause.result : 'The changes could not be saved.',
                );
            } finally {
                setBusy(false);
            }
        },
        [teamId, name, description],
    );

    if (!idInvalid && tab === 'activity') {
        return <Navigate to={teamPath(teamId)} replace />;
    }

    if (idInvalid || meta === undefined) {
        return (
            <Alert variant="destructive">
                <AlertDescription>
                    {idInvalid
                        ? 'That project address is not valid.'
                        : 'There is no such section in this project.'}
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <>
            <PageHeader
                title={meta.title}
                description={
                    team === null
                        ? meta.description
                        : team.description === ''
                          ? meta.description
                          : team.description
                }
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {team === null && error === null && (
                <Stack direction="Vertical" className="gap-3">
                    <Skeleton radius="xl" className="h-40" />
                    <Skeleton radius="xl" className="h-40" />
                </Stack>
            )}

            {team !== null && (tab === '' || tab === 'overview') && (
                <>
                    <MachinePanel />
                    <ActivityPanel teamId={teamId} />
                </>
            )}

            {team !== null && tab === 'agents' && <AgentsPanel teamId={teamId} />}

            {team !== null && tab === 'bots' && (
                <>
                    <BotsPanel teamId={teamId} />
                    <PeoplePanel teamId={teamId} />
                </>
            )}

            {team !== null && tab === 'models' && <ModelsPanel teamId={teamId} />}

            {team !== null && tab === 'settings' && (
                <Card className="max-w-xl">
                    <CardHeader>
                        <CardTitle>Project details</CardTitle>
                        <CardDescription>
                            Created {new Date(team.created_at).toLocaleDateString()}, last changed{' '}
                            {new Date(team.updated_at).toLocaleDateString()}.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <Stack direction="Vertical" as="form" className="gap-5" onSubmit={save}>
                            <Field label="Name">
                                {(fieldId) => (
                                    <Input
                                        id={fieldId}
                                        value={name}
                                        onChange={(event) => {
                                            setName(event.target.value);
                                            setSaved(false);
                                        }}
                                        minLength={2}
                                        maxLength={64}
                                        required
                                    />
                                )}
                            </Field>

                            <Field label="What it is for" hint="Optional.">
                                {(fieldId) => (
                                    <Input
                                        id={fieldId}
                                        value={description}
                                        onChange={(event) => {
                                            setDescription(event.target.value);
                                            setSaved(false);
                                        }}
                                        maxLength={280}
                                        placeholder="Support cover outside office hours"
                                    />
                                )}
                            </Field>

                            <Stack direction="Horizontal" className="items-center gap-3">
                                <Button
                                    type="submit"
                                    disabled={busy}
                                    message={busy ? 'Saving…' : 'Save changes'}
                                />

                                {saved && (
                                    <Text
                                        type="Body"
                                        as="output"
                                        className="text-primary"
                                        message="Saved."
                                    />
                                )}
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
            )}
        </>
    );
}
