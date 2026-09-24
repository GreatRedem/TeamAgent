import { Archive, FolderOpen, FolderPlus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { ApiError, type Paged, type Team, teamCreate, teamList } from '@/apis';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { dateLabel } from '@/libs/format';
import { apiError, t } from '@/libs/i18n';
import { clearAccessToken, readAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function Projects() {
    const navigate = useNavigate();

    const [token, setToken] = useState<string | null>(() => readAccessToken());

    const [teams, setTeams] = useState<Team[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [archived, setArchived] = useState(false);

    useEffect(() => {
        if (token === null) {
            void navigate('/', { replace: true });
        }
    }, [token, navigate]);

    useEffect(() => {
        if (token === null) {
            return;
        }

        let active = true;

        setTeams(null);

        teamList(undefined, archived)
            .then((payload) => {
                if (active) {
                    setTeams(payload.teams);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) => {
                if (!active) {
                    return;
                }

                if (cause instanceof ApiError && cause.status === 401) {
                    clearAccessToken();
                    setToken(null);

                    return;
                }

                setTeams([]);
                setError(apiError(cause, 'projects.errors.loadFailed'));
            });

        return () => {
            active = false;
        };
    }, [token, archived]);

    const goTo = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await teamList({ offset }, archived);

                setTeams(next.teams);
                setPage(next);
            } catch (cause) {
                setError(apiError(cause, 'projects.errors.loadFailed'));
            } finally {
                setPaging(false);
            }
        },
        [archived],
    );

    const create = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();

            setFormError(null);
            setBusy(true);

            try {
                const team = await teamCreate(name.trim(), description.trim());

                setTeams((current) => [team, ...(current ?? [])]);
                setPage((current) => current && { ...current, total: current.total + 1 });
                setName('');
                setDescription('');
                setCreating(false);
            } catch (cause) {
                setFormError(apiError(cause, 'projects.errors.createFailed'));
            } finally {
                setBusy(false);
            }
        },
        [name, description],
    );

    if (token === null) {
        return null;
    }

    const createButton = (
        <Button
            onClick={() => {
                setFormError(null);
                setCreating(true);
            }}
            icon={<Plus />}
            message={t('projects.list.new')}
        />
    );

    return (
        <>
            <PageHeader
                title={archived ? t('projects.list.archivedTitle') : t('projects.list.title')}
                description={
                    archived
                        ? t('projects.list.archivedDescription')
                        : t('projects.list.description')
                }
                actions={
                    <>
                        <Button
                            variant="ghost"
                            icon={archived ? <FolderOpen /> : <Archive />}
                            message={
                                archived
                                    ? t('projects.list.showActive')
                                    : t('projects.list.showArchived')
                            }
                            onClick={() => setArchived(!archived)}
                        />
                        {!archived && createButton}
                    </>
                }
            />

            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent>
                    <Stack direction="Vertical" as="form" className="gap-5" onSubmit={create}>
                        <DialogHeader>
                            <DialogTitle>{t('projects.create.title')}</DialogTitle>
                            <DialogDescription>
                                {t('projects.create.description')}
                            </DialogDescription>
                        </DialogHeader>

                        <Field label={t('projects.field.name')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    minLength={2}
                                    maxLength={64}
                                    required
                                    placeholder={t('projects.field.namePlaceholder')}
                                />
                            )}
                        </Field>

                        <Field
                            label={t('projects.field.purpose')}
                            hint={t('projects.field.purposeHint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    maxLength={280}
                                    placeholder={t('projects.field.purposePlaceholder')}
                                />
                            )}
                        </Field>

                        {formError !== null && (
                            <Alert variant="destructive">
                                <AlertDescription>{formError}</AlertDescription>
                            </Alert>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCreating(false)}
                                message={t('projects.create.cancel')}
                            />
                            <Button
                                type="submit"
                                disabled={busy}
                                message={
                                    busy ? t('projects.create.busy') : t('projects.create.submit')
                                }
                            />
                        </DialogFooter>
                    </Stack>
                </DialogContent>
            </Dialog>

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {teams === null && (
                <Stack direction="Vertical" className="gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:grid">
                    {[0, 1, 2].map((i) => (
                        <Skeleton radius="xl" className="h-40" key={i} />
                    ))}
                </Stack>
            )}

            {teams !== null && teams.length === 0 && !archived && (
                <EmptyState
                    icon={FolderPlus}
                    title={t('projects.list.emptyTitle')}
                    description={t('projects.list.emptyDescription')}
                    action={createButton}
                />
            )}

            {teams !== null && teams.length === 0 && archived && (
                <EmptyState
                    icon={Archive}
                    title={t('projects.list.archivedEmptyTitle')}
                    description={t('projects.list.archivedEmptyDescription')}
                />
            )}

            {teams !== null && teams.length > 0 && (
                <Stack
                    direction="Vertical"
                    as="ul"
                    className="m-0 list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 sm:grid">
                    {teams.map((team) => (
                        <Stack direction="Vertical" as="li" key={team.id}>
                            <Card gap={3} className="h-full transition-colors hover:border-input">
                                <CardHeader>
                                    <CardTitle className="truncate">{team.name}</CardTitle>
                                </CardHeader>

                                <CardContent>
                                    <Text
                                        type="BodyMuted"
                                        className="line-clamp-2 min-h-[2lh]"
                                        message={
                                            team.description === ''
                                                ? t('projects.list.noDescription')
                                                : team.description
                                        }
                                    />
                                </CardContent>

                                <CardFooter className="justify-between gap-3">
                                    <Text
                                        type="DataMuted"
                                        as="time"
                                        dateTime={team.created_at}
                                        message={dateLabel(team.created_at)}
                                    />

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        link={
                                            archived
                                                ? `/dashboard/team/${team.id}/settings`
                                                : `/dashboard/team/${team.id}`
                                        }
                                        message={
                                            archived
                                                ? t('projects.list.restoreOrDelete')
                                                : t('projects.list.open')
                                        }
                                    />
                                </CardFooter>
                            </Card>
                        </Stack>
                    ))}
                </Stack>
            )}

            {page !== null && teams !== null && teams.length > 0 && (
                <Pager
                    framed
                    page={page}
                    shown={teams.length}
                    busy={paging}
                    noun={t('projects.list.pagerNoun')}
                    onPage={(offset) => void goTo(offset)}
                />
            )}
        </>
    );
}
