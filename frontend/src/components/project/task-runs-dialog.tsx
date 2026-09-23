import { useCallback, useEffect, useState } from 'react';

import { ApiError, type Paged, type TaskRun, type TeamTask, taskRuns } from '@/apis';
import { Pager } from '@/components/pager';
import { durationLabel } from '@/libs/format';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

// Every time one task ran, newest first: when it started, how long it took, how it ended, what
// the agent produced and whether it reached its person.
export function TaskRunsDialog({
    teamId,
    task,
    onOpenChange,
}: {
    teamId: number;
    task: TeamTask | null;
    onOpenChange: (open: boolean) => void;
}) {
    const [runs, setRuns] = useState<TaskRun[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const taskId = task?.id;

    useEffect(() => {
        if (taskId === undefined) {
            return;
        }

        let active = true;

        setRuns(null);
        setError(null);

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
                    setError(
                        cause instanceof ApiError ? cause.result : 'The runs could not be loaded.',
                    );
                }
            });

        return () => {
            active = false;
        };
    }, [teamId, taskId]);

    const goTo = useCallback(
        async (offset: number) => {
            if (taskId === undefined) {
                return;
            }

            setPaging(true);

            try {
                const next = await taskRuns(teamId, taskId, { offset });

                setRuns(next.runs);
                setPage(next);
            } catch (cause) {
                setError(
                    cause instanceof ApiError ? cause.result : 'The runs could not be loaded.',
                );
            } finally {
                setPaging(false);
            }
        },
        [teamId, taskId],
    );

    return (
        <Dialog open={task !== null} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{task?.title ?? 'Runs'}</DialogTitle>
                    <DialogDescription>
                        Each time it ran: what the agent produced and whether it was sent. Its calls
                        to the model are under the agent's round-trips.
                    </DialogDescription>
                </DialogHeader>

                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {runs === null && <Skeleton radius="lg" className="h-32" />}

                {runs !== null && runs.length === 0 && (
                    <Text type="BodyMuted" message="It has not run yet." />
                )}

                {runs?.map((run) => (
                    <Stack
                        direction="Vertical"
                        className="gap-2 rounded-lg border px-4 py-3"
                        key={run.id}>
                        <Stack direction="Horizontal" className="flex-wrap items-center gap-2">
                            <Text
                                type="DataMuted"
                                as="time"
                                dateTime={run.started_at}
                                message={new Date(run.started_at).toLocaleString()}
                            />
                            {run.finished_at !== null && (
                                <Text
                                    type="DataMuted"
                                    as="span"
                                    message={durationLabel(
                                        new Date(run.finished_at).getTime() -
                                            new Date(run.started_at).getTime(),
                                    )}
                                />
                            )}
                            <Stack direction="Horizontal" as="span" className="grow" />
                            <Badge
                                variant={
                                    run.outcome === 'ok'
                                        ? 'secondary'
                                        : run.outcome === 'error'
                                          ? 'destructive'
                                          : 'default'
                                }>
                                {run.outcome === 'ok'
                                    ? 'Done'
                                    : run.outcome === 'error'
                                      ? 'Failed'
                                      : 'Running'}
                            </Badge>
                            {task !== null &&
                                task.profile_id !== 0 &&
                                run.outcome !== 'running' && (
                                    <Badge variant="outline">
                                        {run.delivered
                                            ? `Sent to ${task.profile_name}`
                                            : 'Not sent'}
                                    </Badge>
                                )}
                        </Stack>

                        {run.reason !== '' && (
                            <Text type="Body" className="text-destructive" message={run.reason} />
                        )}

                        {run.output !== '' && (
                            <Text
                                type="Body"
                                className="break-anywhere whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2"
                                message={run.output}
                            />
                        )}
                    </Stack>
                ))}

                {page !== null && runs !== null && runs.length > 0 && (
                    <Pager
                        page={page}
                        shown={runs.length}
                        busy={paging}
                        noun="runs"
                        onPage={(offset) => void goTo(offset)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
