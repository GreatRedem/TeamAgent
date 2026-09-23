import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';

import { ApiError, type Team, teamArchive, teamDetails, teamRemove, teamUpdate } from '@/apis';
import { ConfirmButton } from '@/components/confirm-button';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { ActivityPanel } from '@/components/project/activity-panel';
import { AgentsPanel } from '@/components/project/agents-panel';
import { BotsPanel } from '@/components/project/bots-panel';
import { MachinePanel } from '@/components/project/machine-panel';
import { ModelsPanel } from '@/components/project/models-panel';
import { OverviewPanel } from '@/components/project/overview-panel';
import { PeoplePanel } from '@/components/project/people-panel';
import { PluginsPanel } from '@/components/project/plugins-panel';
import { TasksPanel } from '@/components/project/tasks-panel';
import { TeamPanel } from '@/components/project/team-panel';
import { ToolsPanel } from '@/components/project/tools-panel';
import { TransferCard } from '@/components/project/transfer-card';
import { TEAM_NAMES, TEAM_TITLES } from '@/libs/constant';
import { teamPath } from '@/libs/navigation';
import { clearAccessToken, readAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
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
    const [archiving, setArchiving] = useState(false);

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

    const archive = useCallback(
        async (archived: boolean) => {
            setError(null);
            setArchiving(true);

            try {
                setTeam(await teamArchive(teamId, archived));
            } catch (cause) {
                setError(
                    cause instanceof ApiError ? cause.result : 'The project could not be updated.',
                );
            } finally {
                setArchiving(false);
            }
        },
        [teamId],
    );

    const remove = useCallback(async () => {
        setError(null);
        setArchiving(true);

        try {
            await teamRemove(teamId);
            TEAM_NAMES.delete(teamId);

            void navigate('/dashboard', { replace: true });
        } catch (cause) {
            setError(
                cause instanceof ApiError ? cause.result : 'The project could not be deleted.',
            );
            setArchiving(false);
        }
    }, [teamId, navigate]);

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
                    <OverviewPanel teamId={teamId} />
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

            {team !== null && tab === 'tasks' && <TasksPanel teamId={teamId} />}

            {team !== null && tab === 'team' && <TeamPanel teamId={teamId} />}

            {team !== null && tab === 'tools' && <ToolsPanel teamId={teamId} />}

            {team !== null && tab === 'plugins' && <PluginsPanel teamId={teamId} />}

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

            {team !== null && tab === 'settings' && <TransferCard teamId={teamId} />}

            {team !== null && tab === 'settings' && (
                <Card className="max-w-xl">
                    <CardHeader>
                        <CardTitle>
                            {team.archived_at === null ? 'Archive' : 'This project is archived'}
                        </CardTitle>
                        <CardDescription>
                            {team.archived_at === null
                                ? 'An archived project leaves the project list. Its bots keep their settings, and you can restore it or delete it from here.'
                                : `Archived ${new Date(team.archived_at).toLocaleDateString()}. Restore it to bring it back to the project list, or delete it for good.`}
                        </CardDescription>
                    </CardHeader>

                    <CardFooter className="gap-2">
                        {team.archived_at === null ? (
                            <Button
                                variant="outline"
                                disabled={archiving}
                                onClick={() => void archive(true)}
                                message={archiving ? 'Archiving…' : 'Archive project'}
                            />
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    disabled={archiving}
                                    onClick={() => void archive(false)}
                                    message={archiving ? 'Restoring…' : 'Unarchive'}
                                />
                                <ConfirmButton
                                    label="Delete project"
                                    title="Delete this project?"
                                    description="Its bots, agents, models, conversations and records are removed with it. This cannot be undone."
                                    confirmLabel="Delete for good"
                                    disabled={archiving}
                                    onConfirm={() => void remove()}
                                />
                            </>
                        )}
                    </CardFooter>
                </Card>
            )}
        </>
    );
}
