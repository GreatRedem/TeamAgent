import { useCallback, useEffect, useState } from 'react';

import { type Paged, type TaskRun, type TeamTask, taskRuns } from '@/apis';
import { Pager } from '@/components/pager';
import { TASK_LIVE_POLL } from '@/libs/constant';
import { dateTimeLabel, durationLabel } from '@/libs/format';
import { apiError, t, tn } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { StatusDot } from '@/ui/status-dot';
import { Text } from '@/ui/text';

import { TaskRunLog } from './task-run-log';

export function TaskRunsDialog({
    teamId,
    task,
    liveSince,
    onOpenChange,
}: {
    teamId: number;
    task: TeamTask | null;
    liveSince: number | null;
    onOpenChange: (open: boolean) => void;
}) {
    const [runs, setRuns] = useState<TaskRun[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const taskId = task?.id;
    const offset = page?.offset ?? 0;

    useEffect(() => {
        if (taskId === undefined) {
            return;
        }

        let active = true;

        setRuns(null);
        setError(null);
        setExpanded(new Set());

        taskRuns(teamId, taskId)
            .then((payload) => {
                if (active) {
                    setRuns(payload.runs);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setRuns([]);
                    setError(apiError(cause, 'tasks.runs.errors.loadFailed'));
                }
            });

        return () => {
            active = false;
        };
    }, [teamId, taskId]);

    const awaited =
        liveSince !== null &&
        Date.now() - liveSince < 60_000 &&
        !(runs ?? []).some((run) => new Date(run.started_at).getTime() >= liveSince - 5_000);
    const watching = runs !== null && (runs.some((run) => run.outcome === 'running') || awaited);

    useEffect(() => {
        if (taskId === undefined || !watching) {
            return;
        }

        const timer = setInterval(() => {
            taskRuns(teamId, taskId, { offset })
                .then((payload) => {
                    setRuns(payload.runs);
                    setPage(payload);
                })
                .catch(() => {});
        }, TASK_LIVE_POLL);

        return () => clearInterval(timer);
    }, [teamId, taskId, watching, offset]);

    const goTo = useCallback(
        async (next: number) => {
            if (taskId === undefined) {
                return;
            }

            setPaging(true);

            try {
                const payload = await taskRuns(teamId, taskId, { offset: next });

                setRuns(payload.runs);
                setPage(payload);
            } catch (cause) {
                setError(apiError(cause, 'tasks.runs.errors.loadFailed'));
            } finally {
                setPaging(false);
            }
        },
        [teamId, taskId],
    );

    const toggle = (id: number) =>
        setExpanded((current) => {
            const next = new Set(current);

            if (!next.delete(id)) {
                next.add(id);
            }

            return next;
        });

    const finished = (task?.ok_count ?? 0) + (task?.error_count ?? 0);

    return (
        <Dialog open={task !== null} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{task?.title ?? t('tasks.runs.title')}</DialogTitle>
                    <DialogDescription>
                        {task === null || finished === 0
                            ? t('tasks.runs.description')
                            : tn('tasks.runs.summary', finished, {
                                  ok: task.ok_count,
                                  failed: task.error_count,
                                  percent: Math.round((task.ok_count / finished) * 100),
                              })}
                    </DialogDescription>
                </DialogHeader>

                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {runs === null && <Skeleton radius="lg" className="h-32" />}

                {runs !== null && runs.length === 0 && (
                    <Text
                        type="BodyMuted"
                        message={awaited ? t('tasks.runs.starting') : t('tasks.runs.notYet')}
                    />
                )}

                {runs?.map((run) => {
                    const running = run.outcome === 'running';
                    const open = running || expanded.has(run.id);
                    const took =
                        (run.finished_at === null
                            ? Date.now()
                            : new Date(run.finished_at).getTime()) -
                        new Date(run.started_at).getTime();

                    return (
                        <Stack
                            direction="Vertical"
                            className="gap-3 rounded-lg border px-4 py-3"
                            key={run.id}>
                            <Stack direction="Horizontal" className="flex-wrap items-center gap-2">
                                <Text
                                    type="DataMuted"
                                    as="time"
                                    dateTime={run.started_at}
                                    message={dateTimeLabel(run.started_at)}
                                />
                                <Text
                                    type="DataMuted"
                                    as="span"
                                    message={
                                        running
                                            ? t('tasks.runs.runningFor', {
                                                  duration: durationLabel(took),
                                              })
                                            : durationLabel(took)
                                    }
                                />
                                <Stack direction="Horizontal" as="span" className="grow" />
                                {running ? (
                                    <Badge variant="default" className="gap-1.5">
                                        <StatusDot status="live" />
                                        {t('tasks.runs.live')}
                                    </Badge>
                                ) : (
                                    <Badge
                                        variant={
                                            run.outcome === 'ok' ? 'secondary' : 'destructive'
                                        }>
                                        {run.outcome === 'ok'
                                            ? t('tasks.runs.succeeded')
                                            : t('tasks.runs.failed')}
                                    </Badge>
                                )}
                                {task !== null && task.profile_id !== 0 && !running && (
                                    <Badge variant="outline">
                                        {run.delivered
                                            ? t('tasks.runs.sentTo', { name: task.profile_name })
                                            : t('tasks.runs.notSent')}
                                    </Badge>
                                )}
                            </Stack>

                            {run.model !== '' && (
                                <Text
                                    type="DataMuted"
                                    message={tn('tasks.runs.usage', run.tool_calls, {
                                        model: run.model,
                                        prompt: run.prompt_tokens,
                                        completion: run.completion_tokens,
                                    })}
                                />
                            )}

                            {run.reason !== '' && (
                                <Text
                                    type="Body"
                                    className="text-destructive"
                                    message={run.reason}
                                />
                            )}

                            {run.output !== '' && (
                                <Stack direction="Vertical" className="gap-1">
                                    {running && (
                                        <Text type="Caption" message={t('tasks.runs.writing')} />
                                    )}
                                    <Text
                                        type="Body"
                                        className="break-anywhere whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2"
                                        message={run.output}
                                    />
                                </Stack>
                            )}

                            {!running && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="self-start"
                                    onClick={() => toggle(run.id)}
                                    message={
                                        open
                                            ? t('tasks.runs.hideSteps')
                                            : t('tasks.runs.showSteps', { count: run.log.length })
                                    }
                                />
                            )}

                            {open && <TaskRunLog startedAt={run.started_at} events={run.log} />}
                        </Stack>
                    );
                })}

                {page !== null && runs !== null && runs.length > 0 && (
                    <Pager
                        page={page}
                        shown={runs.length}
                        busy={paging}
                        noun={t('tasks.runs.pager.noun')}
                        onPage={(next) => void goTo(next)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
