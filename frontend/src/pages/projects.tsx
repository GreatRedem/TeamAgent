import { Archive, FolderOpen, FolderPlus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { ApiError, type Paged, type Team, teamCreate, teamList } from '@/apis';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
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
    // Archived projects stay out of the main list; this switches the page to them.
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
                setError(
                    cause instanceof ApiError ? cause.result : 'Your projects could not be loaded.',
                );
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
                setError(
                    cause instanceof ApiError ? cause.result : 'Your projects could not be loaded.',
                );
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
                setFormError(
                    cause instanceof ApiError ? cause.result : 'The project could not be created.',
                );
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
            message="New project"
        />
    );

    return (
        <>
            <PageHeader
                title={archived ? 'Archived projects' : 'Projects'}
                description={
                    archived
                        ? 'Projects you have put away. Open one to restore it or delete it for good.'
                        : 'A project holds the bots people message, the agents that answer, and the models behind them.'
                }
                actions={
                    <>
                        <Button
                            variant="ghost"
                            icon={archived ? <FolderOpen /> : <Archive />}
                            message={archived ? 'Active projects' : 'Archived'}
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
                            <DialogTitle>New project</DialogTitle>
                            <DialogDescription>
                                Group the bots, agents and models that belong together.
                            </DialogDescription>
                        </DialogHeader>

                        <Field label="Name">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    minLength={2}
                                    maxLength={64}
                                    required
                                    placeholder="Night shift"
                                />
                            )}
                        </Field>

                        <Field label="What it is for" hint="Optional. Shown on the project card.">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    maxLength={280}
                                    placeholder="Support cover outside office hours"
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
                                message="Cancel"
                            />
                            <Button
                                type="submit"
                                disabled={busy}
                                message={busy ? 'Creating…' : 'Create project'}
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
                    title="No projects yet"
                    description="Start with one project. You can add a model, an agent and a bot to it in a few minutes."
                    action={createButton}
                />
            )}

            {teams !== null && teams.length === 0 && archived && (
                <EmptyState
                    icon={Archive}
                    title="Nothing archived"
                    description="Archive a project from its settings to put it away without losing it."
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
                                                ? 'No description yet.'
                                                : team.description
                                        }
                                    />
                                </CardContent>

                                <CardFooter className="justify-between gap-3">
                                    <Text
                                        type="DataMuted"
                                        as="time"
                                        dateTime={team.created_at}
                                        message={new Date(team.created_at).toLocaleDateString()}
                                    />

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        link={
                                            archived
                                                ? `/dashboard/team/${team.id}/settings`
                                                : `/dashboard/team/${team.id}`
                                        }
                                        message={archived ? 'Restore or delete' : 'Open'}
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
                    noun="projects"
                    onPage={(offset) => void goTo(offset)}
                />
            )}
        </>
    );
}
