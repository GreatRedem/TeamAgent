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
import { dateLabel } from '@/libs/format';
import { apiError, t } from '@/libs/i18n';
import { teamPath } from '@/libs/navigation';
import { clearAccessToken, readAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { DataList, DataRow } from '@/ui/data-value';
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

                setError(apiError(cause, 'projects.errors.projectLoadFailed'));
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
                setError(apiError(cause, 'projects.errors.saveFailed'));
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
                setError(apiError(cause, 'projects.errors.updateFailed'));
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
            setError(apiError(cause, 'projects.errors.deleteFailed'));
            setArchiving(false);
        }
    }, [teamId, navigate]);

    const edited =
        team !== null && (name.trim() !== team.name || description.trim() !== team.description);

    if (!idInvalid && tab === 'activity') {
        return <Navigate to={teamPath(teamId)} replace />;
    }

    if (idInvalid || meta === undefined) {
        return (
            <Alert variant="destructive">
                <AlertDescription>
                    {idInvalid ? t('errors.TEAM_ID_INVALID') : t('projects.errors.noSection')}
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <>
            <PageHeader
                title={t(meta.title)}
                description={
                    team === null
                        ? t(meta.description)
                        : team.description === ''
                          ? t(meta.description)
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
                <Stack
                    direction="Vertical"
                    className="gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
                    <Stack direction="Vertical" className="gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('projects.settings.title')}</CardTitle>
                            </CardHeader>

                            <Stack direction="Vertical" as="form" className="gap-5" onSubmit={save}>
                                <CardContent>
                                    <Stack direction="Vertical" className="gap-5">
                                        <Field label={t('projects.field.name')}>
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

                                        <Field
                                            label={t('projects.field.purpose')}
                                            hint={t('projects.field.purposeHint')}>
                                            {(fieldId) => (
                                                <Input
                                                    id={fieldId}
                                                    value={description}
                                                    onChange={(event) => {
                                                        setDescription(event.target.value);
                                                        setSaved(false);
                                                    }}
                                                    maxLength={280}
                                                    placeholder={t(
                                                        'projects.field.purposePlaceholder',
                                                    )}
                                                />
                                            )}
                                        </Field>
                                    </Stack>
                                </CardContent>

                                <CardFooter className="gap-3 border-t">
                                    <Button
                                        type="submit"
                                        disabled={busy || !edited}
                                        message={
                                            busy
                                                ? t('projects.settings.saving')
                                                : t('projects.settings.save')
                                        }
                                    />

                                    {saved && (
                                        <Text
                                            type="Body"
                                            as="output"
                                            className="text-primary"
                                            message={t('projects.settings.saved')}
                                        />
                                    )}
                                </CardFooter>
                            </Stack>
                        </Card>

                        <TransferCard teamId={teamId} />
                    </Stack>

                    <Stack direction="Vertical" className="gap-6 xl:sticky xl:top-32">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('projects.settings.aboutTitle')}</CardTitle>
                            </CardHeader>

                            <CardContent>
                                <DataList>
                                    <DataRow label={t('projects.settings.id')} value={team.id} />
                                    <DataRow
                                        label={t('projects.settings.created')}
                                        value={dateLabel(team.created_at)}
                                    />
                                    <DataRow
                                        label={t('projects.settings.changed')}
                                        value={dateLabel(team.updated_at)}
                                    />
                                </DataList>
                            </CardContent>
                        </Card>

                        <Card signal={team.archived_at === null ? undefined : 'degraded'}>
                            <CardHeader>
                                <CardTitle>
                                    {team.archived_at === null
                                        ? t('projects.archive.title')
                                        : t('projects.archive.archivedTitle')}
                                </CardTitle>
                                <CardDescription>
                                    {team.archived_at === null
                                        ? t('projects.archive.description')
                                        : t('projects.archive.archivedDescription', {
                                              date: dateLabel(team.archived_at),
                                          })}
                                </CardDescription>
                            </CardHeader>

                            <CardFooter className="flex-wrap gap-2">
                                {team.archived_at === null ? (
                                    <Button
                                        variant="outline"
                                        disabled={archiving}
                                        onClick={() => void archive(true)}
                                        message={
                                            archiving
                                                ? t('projects.archive.archiving')
                                                : t('projects.archive.archive')
                                        }
                                    />
                                ) : (
                                    <>
                                        <Button
                                            variant="outline"
                                            disabled={archiving}
                                            onClick={() => void archive(false)}
                                            message={
                                                archiving
                                                    ? t('projects.archive.restoring')
                                                    : t('projects.archive.restore')
                                            }
                                        />
                                        <ConfirmButton
                                            label={t('projects.delete.label')}
                                            title={t('projects.delete.title')}
                                            description={t('projects.delete.description')}
                                            confirmLabel={t('projects.delete.confirm')}
                                            disabled={archiving}
                                            onConfirm={() => void remove()}
                                        />
                                    </>
                                )}
                            </CardFooter>
                        </Card>
                    </Stack>
                </Stack>
            )}
        </>
    );
}
