import { ListChecks, Play, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    ApiError,
    agentList,
    type Paged,
    type TeamAgent,
    type TeamTask,
    taskList,
    taskRemove,
    taskRunNow,
    taskStatus,
} from '@/apis';
import { ConfirmButton } from '@/components/confirm-button';
import { EmptyState } from '@/components/empty-state';
import { Pager } from '@/components/pager';
import { TASK_ERRORS, TASK_REPEAT_LABELS, TASK_STATUS } from '@/libs/constant';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { DataList } from '@/ui/data-value';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

import { TaskDialog } from './task-dialog';
import { TaskRunsDialog } from './task-runs-dialog';

// The work agents carry out at a set time: what each task is, when it runs, who it is for, how
// its last run went, and every run before that.
export function TasksPanel({ teamId }: { teamId: number }) {
    const [tasks, setTasks] = useState<TeamTask[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [agents, setAgents] = useState<TeamAgent[]>([]);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // null: closed. 'new': creating. A task: editing it.
    const [editing, setEditing] = useState<TeamTask | 'new' | null>(null);
    const [viewing, setViewing] = useState<TeamTask | null>(null);

    const load = useCallback(
        async (offset = 0) => {
            setPaging(true);

            try {
                const next = await taskList(teamId, { offset });

                setTasks(next.tasks);
                setPage(next);
            } catch (cause) {
                setTasks((current) => current ?? []);
                setError(
                    cause instanceof ApiError ? cause.result : 'The tasks could not be loaded.',
                );
            } finally {
                setPaging(false);
            }
        },
        [teamId],
    );

    useEffect(() => {
        void load();

        agentList(teamId, { limit: 200 })
            .then((payload) => setAgents(payload.agents))
            .catch(() => setAgents([]));
    }, [teamId, load]);

    const replace = (task: TeamTask) =>
        setTasks((current) => {
            if (current === null) {
                return [task];
            }

            return current.some((item) => item.id === task.id)
                ? current.map((item) => (item.id === task.id ? task : item))
                : [task, ...current];
        });

    const act = async (run: () => Promise<unknown>, done?: string) => {
        setError(null);
        setNotice(null);

        try {
            await run();

            if (done !== undefined) {
                setNotice(done);
            }
        } catch (cause) {
            setError(
                cause instanceof ApiError
                    ? (TASK_ERRORS[cause.result] ?? cause.result)
                    : 'That did not work.',
            );
        }
    };

    const newButton = (
        <Button
            onClick={() => setEditing('new')}
            disabled={agents.length === 0}
            icon={<Plus />}
            message="New task"
        />
    );

    return (
        <Stack direction="Vertical" as="section" className="gap-4">
            <TaskDialog
                open={editing !== null}
                teamId={teamId}
                task={editing === 'new' ? null : editing}
                agents={agents}
                onOpenChange={(next) => {
                    if (!next) {
                        setEditing(null);
                    }
                }}
                onSaved={replace}
            />

            <TaskRunsDialog
                teamId={teamId}
                task={viewing}
                onOpenChange={(next) => {
                    if (!next) {
                        setViewing(null);
                    }
                }}
            />

            <Stack direction="Horizontal" className="flex-wrap items-center justify-between gap-3">
                <Text
                    type="BodyMuted"
                    message={
                        tasks === null
                            ? 'Loading tasks.'
                            : agents.length === 0
                              ? 'Add an agent first; a task needs one to carry it out.'
                              : `${page?.total.toLocaleString() ?? tasks.length} task${(page?.total ?? tasks.length) === 1 ? '' : 's'}. They run on their own at their time.`
                    }
                />

                <Stack direction="Horizontal" className="gap-2">
                    <Button
                        variant="outline"
                        disabled={paging}
                        onClick={() => void load(page?.offset ?? 0)}
                        icon={<RefreshCw />}
                        message="Refresh"
                    />
                    {newButton}
                </Stack>
            </Stack>

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {notice !== null && (
                <Alert>
                    <AlertDescription>{notice}</AlertDescription>
                </Alert>
            )}

            {tasks === null && (
                <Stack direction="Vertical" className="gap-3 sm:grid sm:grid-cols-2">
                    {[0, 1].map((i) => (
                        <Skeleton radius="xl" className="h-56" key={i} />
                    ))}
                </Stack>
            )}

            {tasks !== null && tasks.length === 0 && (
                <EmptyState
                    icon={ListChecks}
                    title="No tasks yet"
                    description="Give an agent something to do at a set time: write a post and send it to someone, check the weather each morning, look something up on a site."
                    action={newButton}
                />
            )}

            {tasks !== null && tasks.length > 0 && (
                <Stack
                    direction="Vertical"
                    as="ul"
                    className="m-0 list-none gap-3 p-0 sm:grid sm:grid-cols-2">
                    {tasks.map((task) => {
                        const status = TASK_STATUS[task.status] ?? TASK_STATUS['scheduled'];

                        return (
                            <Stack direction="Vertical" as="li" key={task.id}>
                                <Card gap={3} className="h-full">
                                    <CardHeader>
                                        <CardTitle className="flex min-w-0 items-center gap-2">
                                            <Text
                                                type="Foreground"
                                                as="span"
                                                className="min-w-0 grow truncate"
                                                message={task.title}
                                            />
                                            <Badge variant={status.variant}>{status.label}</Badge>
                                        </CardTitle>
                                    </CardHeader>

                                    <CardContent className="grid gap-3">
                                        {(task.goal !== '' || task.description !== '') && (
                                            <Text
                                                type="BodyMuted"
                                                className="line-clamp-3"
                                                message={
                                                    task.goal !== '' ? task.goal : task.description
                                                }
                                            />
                                        )}

                                        <DataList dense>
                                            <Text type="ForegroundMuted" as="dt" message="Agent" />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={
                                                    task.agent_name === ''
                                                        ? 'Removed agent'
                                                        : task.agent_name
                                                }
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Sends to"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={
                                                    task.profile_id === 0
                                                        ? 'Kept here'
                                                        : task.profile_name
                                                }
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={
                                                    task.status === 'scheduled' ? 'Runs' : 'Was due'
                                                }
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={`${new Date(task.start_at).toLocaleString()} · ${TASK_REPEAT_LABELS[task.repeat] ?? task.repeat}`}
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Last run"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={
                                                    task.last_run_at === null
                                                        ? 'Not yet'
                                                        : `${new Date(task.last_run_at).toLocaleString()} · ${task.last_outcome === 'ok' ? 'done' : task.last_outcome === 'error' ? 'failed' : task.last_outcome}`
                                                }
                                            />
                                        </DataList>
                                    </CardContent>

                                    <CardFooter className="mt-auto flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={
                                                task.status === 'running' ||
                                                task.status === 'cancelled'
                                            }
                                            icon={<Play />}
                                            onClick={() =>
                                                void act(async () => {
                                                    await taskRunNow(teamId, task.id);
                                                    replace({ ...task, status: 'running' });
                                                }, `${task.title} is running. Refresh in a moment to see how it went.`)
                                            }
                                            message="Run now"
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setViewing(task)}
                                            message={`Runs (${task.run_count})`}
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={task.status === 'running'}
                                            onClick={() => setEditing(task)}
                                            message="Modify"
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={task.status === 'running'}
                                            onClick={() =>
                                                void act(async () =>
                                                    replace(
                                                        await taskStatus(
                                                            teamId,
                                                            task.id,
                                                            task.status === 'cancelled'
                                                                ? 'scheduled'
                                                                : 'cancelled',
                                                        ),
                                                    ),
                                                )
                                            }
                                            message={
                                                task.status === 'cancelled' ? 'Schedule' : 'Cancel'
                                            }
                                        />

                                        <Stack direction="Horizontal" as="span" className="grow" />

                                        <ConfirmButton
                                            label="Remove"
                                            title={`Remove ${task.title}?`}
                                            description="The task and the record of its runs are deleted. Anything it already sent stays sent."
                                            confirmLabel="Remove task"
                                            onConfirm={() =>
                                                void act(async () => {
                                                    await taskRemove(teamId, task.id);
                                                    setTasks(
                                                        (current) =>
                                                            current?.filter(
                                                                (item) => item.id !== task.id,
                                                            ) ?? null,
                                                    );
                                                })
                                            }
                                        />
                                    </CardFooter>
                                </Card>
                            </Stack>
                        );
                    })}
                </Stack>
            )}

            {page !== null && tasks !== null && tasks.length > 0 && (
                <Pager
                    framed
                    page={page}
                    shown={tasks.length}
                    busy={paging}
                    noun="tasks"
                    onPage={(offset) => void load(offset)}
                />
            )}
        </Stack>
    );
}
