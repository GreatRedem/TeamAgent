import { ListChecks, Play, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
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
import { TASK_REPEAT_LABELS, TASK_STATUS } from '@/libs/constant';
import { dateTimeLabel } from '@/libs/format';
import { apiError, t, tn } from '@/libs/i18n';
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

export function TasksPanel({ teamId }: { teamId: number }) {
    const [tasks, setTasks] = useState<TeamTask[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [agents, setAgents] = useState<TeamAgent[]>([]);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [editing, setEditing] = useState<TeamTask | 'new' | null>(null);
    const [viewing, setViewing] = useState<TeamTask | null>(null);
    const [liveSince, setLiveSince] = useState<number | null>(null);

    const load = useCallback(
        async (offset = 0) => {
            setPaging(true);

            try {
                const next = await taskList(teamId, { offset });

                setTasks(next.tasks);
                setPage(next);
            } catch (cause) {
                setTasks((current) => current ?? []);
                setError(apiError(cause, 'tasks.errors.loadFailed'));
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
            setError(apiError(cause, 'tasks.errors.actionFailed'));
        }
    };

    const newButton = (
        <Button
            onClick={() => setEditing('new')}
            disabled={agents.length === 0}
            icon={<Plus />}
            message={t('tasks.new')}
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
                liveSince={liveSince}
                onOpenChange={(next) => {
                    if (!next) {
                        setViewing(null);
                        setLiveSince(null);
                        void load(page?.offset ?? 0);
                    }
                }}
            />

            <Stack direction="Horizontal" className="flex-wrap items-center justify-between gap-3">
                <Text
                    type="BodyMuted"
                    message={
                        tasks === null
                            ? t('tasks.loading')
                            : agents.length === 0
                              ? t('tasks.needsAgent')
                              : tn('tasks.summary', page?.total ?? tasks.length)
                    }
                />

                <Stack direction="Horizontal" className="gap-2">
                    <Button
                        variant="outline"
                        disabled={paging}
                        onClick={() => void load(page?.offset ?? 0)}
                        icon={<RefreshCw />}
                        message={t('tasks.refresh')}
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
                    title={t('tasks.empty.title')}
                    description={t('tasks.empty.description')}
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
                                            <Badge variant={status.variant}>
                                                {t(status.label)}
                                            </Badge>
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
                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={t('tasks.card.agent')}
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={
                                                    task.agent_name === ''
                                                        ? t('tasks.card.removedAgent')
                                                        : task.agent_name
                                                }
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={t('tasks.card.sendsTo')}
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={
                                                    task.profile_id === 0
                                                        ? t('tasks.card.keptHere')
                                                        : task.profile_name
                                                }
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={
                                                    task.status === 'scheduled'
                                                        ? t('tasks.card.runs')
                                                        : t('tasks.card.wasDue')
                                                }
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={
                                                    task.retry_at !== null
                                                        ? t('tasks.card.retryAt', {
                                                              count: task.retry_count,
                                                              time: dateTimeLabel(task.retry_at),
                                                          })
                                                        : t('tasks.card.schedule', {
                                                              time: dateTimeLabel(task.start_at),
                                                              repeat:
                                                                  TASK_REPEAT_LABELS[
                                                                      task.repeat
                                                                  ] === undefined
                                                                      ? task.repeat
                                                                      : t(
                                                                            TASK_REPEAT_LABELS[
                                                                                task.repeat
                                                                            ],
                                                                        ),
                                                          })
                                                }
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={t('tasks.card.lastRun')}
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={
                                                    task.last_run_at === null
                                                        ? t('tasks.card.notYet')
                                                        : task.last_outcome === 'ok'
                                                          ? t('tasks.card.lastRunSucceeded', {
                                                                time: dateTimeLabel(
                                                                    task.last_run_at,
                                                                ),
                                                            })
                                                          : task.last_outcome === 'error'
                                                            ? t('tasks.card.lastRunFailed', {
                                                                  time: dateTimeLabel(
                                                                      task.last_run_at,
                                                                  ),
                                                              })
                                                            : t('tasks.card.lastRunOutcome', {
                                                                  time: dateTimeLabel(
                                                                      task.last_run_at,
                                                                  ),
                                                                  outcome: task.last_outcome,
                                                              })
                                                }
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={t('tasks.card.success')}
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={
                                                    task.ok_count + task.error_count === 0
                                                        ? t('tasks.card.noFinishedRuns')
                                                        : t('tasks.card.successRate', {
                                                              ok: task.ok_count,
                                                              total:
                                                                  task.ok_count + task.error_count,
                                                              percent: Math.round(
                                                                  (task.ok_count /
                                                                      (task.ok_count +
                                                                          task.error_count)) *
                                                                      100,
                                                              ),
                                                          })
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
                                                    setLiveSince(Date.now());
                                                    setViewing({ ...task, status: 'running' });
                                                })
                                            }
                                            message={
                                                task.status === 'failed'
                                                    ? t('tasks.actions.retry')
                                                    : t('tasks.actions.runNow')
                                            }
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setLiveSince(null);
                                                setViewing(task);
                                            }}
                                            message={t('tasks.actions.history', {
                                                count: task.run_count,
                                            })}
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={task.status === 'running'}
                                            onClick={() => setEditing(task)}
                                            message={t('tasks.actions.modify')}
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
                                                task.status === 'cancelled'
                                                    ? t('tasks.actions.schedule')
                                                    : t('tasks.actions.cancel')
                                            }
                                        />

                                        <Stack direction="Horizontal" as="span" className="grow" />

                                        <ConfirmButton
                                            label={t('tasks.remove.label')}
                                            title={t('tasks.remove.title', { title: task.title })}
                                            description={t('tasks.remove.description')}
                                            confirmLabel={t('tasks.remove.confirm')}
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
                    noun={t('tasks.pager.noun')}
                    onPage={(offset) => void load(offset)}
                />
            )}
        </Stack>
    );
}
