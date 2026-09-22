import { FolderPlus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { ApiError, teamCreate, teamList, type Paged, type Team } from '@/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { Skeleton } from '@/components/ui/skeleton';
import { clearAccessToken, readAccessToken } from '@/lib/session';

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

        teamList()
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
    }, [token]);

    const goTo = useCallback(async (offset: number) => {
        setPaging(true);

        try {
            const next = await teamList({ offset });

            setTeams(next.teams);
            setPage(next);
        } catch (cause) {
            setError(
                cause instanceof ApiError ? cause.result : 'Your projects could not be loaded.',
            );
        } finally {
            setPaging(false);
        }
    }, []);

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
        >
            <Plus aria-hidden="true" />
            New project
        </Button>
    );

    return (
        <>
            <PageHeader
                title="Projects"
                description="A project holds the bots people message, the agents that answer, and the models behind them."
                actions={createButton}
            />

            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent>
                    <form className="grid gap-5" onSubmit={create}>
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
                                variant="ghost"
                                onClick={() => setCreating(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={busy}>
                                {busy ? 'Creating…' : 'Create project'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {teams === null && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <Skeleton className="h-40 rounded-xl" key={i} />
                    ))}
                </div>
            )}

            {teams !== null && teams.length === 0 && (
                <EmptyState
                    icon={FolderPlus}
                    title="No projects yet"
                    description="Start with one project. You can add a model, an agent and a bot to it in a few minutes."
                    action={createButton}
                />
            )}

            {teams !== null && teams.length > 0 && (
                <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    {teams.map((team) => (
                        <li key={team.id}>
                            <Card className="h-full gap-3 transition-colors hover:border-input">
                                <CardHeader>
                                    <CardTitle className="truncate">{team.name}</CardTitle>
                                </CardHeader>

                                <CardContent>
                                    <p className="m-0 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                                        {team.description === ''
                                            ? 'No description yet.'
                                            : team.description}
                                    </p>
                                </CardContent>

                                <CardFooter className="justify-between gap-3">
                                    <time
                                        className="font-mono text-2xs text-muted-foreground"
                                        dateTime={team.created_at}
                                    >
                                        {new Date(team.created_at).toLocaleDateString()}
                                    </time>

                                    <Button asChild variant="outline" size="sm">
                                        <Link to={`/dashboard/team/${team.id}`}>Open</Link>
                                    </Button>
                                </CardFooter>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            {page !== null && teams !== null && teams.length > 0 && (
                <PaginationFooter
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
