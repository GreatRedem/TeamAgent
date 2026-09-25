import { Activity } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { type AuditEntry, auditHeatmap, auditList, type HeatmapDay, type Paged } from '@/apis';
import { EmptyState } from '@/components/empty-state';
import { Pager } from '@/components/pager';
import { actionText } from '@/libs/catalog';
import { cn } from '@/libs/cn';
import { AUDIT_RESULT, HEAT_SCALE, HEAT_SCALE_FAILED } from '@/libs/constant';
import { dateTimeLabel, numberLabel, prettyJson, timeLabel } from '@/libs/format';
import { apiError, t, tn } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { CodeBlock } from '@/ui/code-block';
import { DataList, DataRow } from '@/ui/data-value';
import { Pressable } from '@/ui/pressable';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';
import { Heatmap } from './heatmap';

function roundTrip(
    entry: AuditEntry,
): { agent: string; model: string; messages: string; chars: string; tools: string } | null {
    if (entry.action !== 'agent.request') {
        return null;
    }

    return {
        agent: /agent \d+ \((.+?)\)/.exec(entry.detail)?.[1] ?? '',
        model: /model \d+(?: \((.+?)\))?/.exec(entry.detail)?.[1] ?? '',
        messages: /(\d+) messages in/.exec(entry.detail)?.[1] ?? '',
        chars: /(\d+) chars out/.exec(entry.detail)?.[1] ?? '',
        tools: /(\d+) tool call/.exec(entry.detail)?.[1] ?? '',
    };
}

function clock(iso: string): string {
    return timeLabel(iso, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export function ActivityPanel({ teamId }: { teamId: number }) {
    const [heatmap, setHeatmap] = useState<{
        days: HeatmapDay[];
        total: number;
        busiest: number;
    } | null>(null);
    const [entries, setEntries] = useState<AuditEntry[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [failuresOnly, setFailuresOnly] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);

    useEffect(() => {
        let active = true;

        Promise.all([auditHeatmap(teamId), auditList(teamId)])
            .then(([map, payload]) => {
                if (active) {
                    setHeatmap(map);
                    setEntries(payload.entries);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setEntries([]);
                    setError(apiError(cause, 'activity.errors.loadFailed'));
                }
            });

        return () => {
            active = false;
        };
    }, [teamId]);

    const goTo = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await auditList(teamId, { offset });

                setEntries(next.entries);
                setPage(next);
                setSelectedId(null);
            } catch (cause) {
                setError(apiError(cause, 'activity.errors.loadFailed'));
            } finally {
                setPaging(false);
            }
        },
        [teamId],
    );

    const rows =
        entries === null
            ? []
            : failuresOnly
              ? entries.filter((entry) => entry.outcome === 'error')
              : entries;

    const selected = rows.find((entry) => entry.id === selectedId) ?? rows[0] ?? null;
    const trip = selected === null ? null : roundTrip(selected);

    const succeededTotal = heatmap?.days.reduce((sum, day) => sum + day.total - day.errors, 0) ?? 0;
    const failedTotal = heatmap?.days.reduce((sum, day) => sum + day.errors, 0) ?? 0;

    const cards = (list: AuditEntry[]) => (
        <Stack
            direction="Vertical"
            as="ul"
            className="gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2">
            {list.map((entry) => {
                const row = roundTrip(entry);
                const result = AUDIT_RESULT[entry.outcome];
                const open = selected?.id === entry.id;

                return (
                    <Stack direction="Vertical" as="li" key={entry.id}>
                        <Pressable
                            data-pressed={open ? '' : undefined}
                            className="flex h-full w-full flex-col gap-1.5 rounded-lg border bg-card p-3 transition-colors hover:border-input hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-pressed:border-primary/60 data-pressed:bg-accent/40"
                            onClick={() => setSelectedId(entry.id)}>
                            <Stack
                                direction="Horizontal"
                                as="span"
                                className="min-w-0 items-baseline justify-between gap-2">
                                <Text
                                    type="BodyStrong"
                                    as="span"
                                    className="truncate"
                                    message={
                                        row !== null && row.agent !== '' ? row.agent : entry.actor
                                    }
                                />
                                <Text
                                    type="DataMuted"
                                    as="time"
                                    className="shrink-0"
                                    dateTime={entry.created_at}
                                    message={clock(entry.created_at)}
                                />
                            </Stack>

                            <Text
                                type="DataMuted"
                                as="span"
                                className="truncate"
                                message={
                                    row !== null && row.model !== ''
                                        ? row.model
                                        : actionText(entry.action)
                                }
                            />

                            <Stack
                                direction="Horizontal"
                                as="span"
                                className="min-w-0 items-baseline justify-between gap-2">
                                <Text
                                    type="DataMuted"
                                    as="span"
                                    className="truncate"
                                    message={
                                        row !== null && row.messages !== ''
                                            ? t('activity.trail.sizes', {
                                                  messages: Number(row.messages),
                                                  chars: Number(row.chars),
                                              })
                                            : entry.target === ''
                                              ? '—'
                                              : entry.target
                                    }
                                />
                                <Stack
                                    direction="Horizontal"
                                    as="span"
                                    className="shrink-0 items-baseline gap-2">
                                    {entry.duration_ms > 0 && (
                                        <Text
                                            type="DataMuted"
                                            as="span"
                                            message={t('common.milliseconds', {
                                                count: entry.duration_ms,
                                            })}
                                        />
                                    )}
                                    <Text
                                        type="BodyStrong"
                                        as="span"
                                        className={result.className}
                                        message={t(result.label)}
                                    />
                                </Stack>
                            </Stack>
                        </Pressable>
                    </Stack>
                );
            })}
        </Stack>
    );

    return (
        <Stack direction="Vertical" className="gap-6">
            <Stack direction="Vertical" className="gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('activity.succeeded.title')}</CardTitle>
                        <CardDescription>
                            {heatmap === null
                                ? t('activity.succeeded.loading')
                                : tn('activity.succeeded.summary', succeededTotal)}
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        {heatmap === null ? (
                            <Skeleton radius="lg" className="h-40" />
                        ) : (
                            <Heatmap
                                days={heatmap.days}
                                count={(day) => day.total - day.errors}
                                scale={HEAT_SCALE}
                                noun={[t('activity.noun.action'), t('activity.noun.actions')]}
                            />
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('activity.failed.title')}</CardTitle>
                        <CardDescription>
                            {heatmap === null
                                ? t('activity.failed.loading')
                                : failedTotal === 0
                                  ? t('activity.failed.none')
                                  : tn('activity.failed.summary', failedTotal)}
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        {heatmap === null ? (
                            <Skeleton radius="lg" className="h-40" />
                        ) : (
                            <Heatmap
                                days={heatmap.days}
                                count={(day) => day.errors}
                                scale={HEAT_SCALE_FAILED}
                                noun={[t('activity.noun.failure'), t('activity.noun.failures')]}
                            />
                        )}
                    </CardContent>
                </Card>
            </Stack>

            <Stack
                direction="Vertical"
                className="xl:items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:grid">
                <Card className="overflow-hidden">
                    <CardHeader>
                        <CardTitle>{t('activity.trail.title')}</CardTitle>
                        <CardDescription>{t('activity.trail.description')}</CardDescription>

                        <Stack
                            direction="Horizontal"
                            className="col-start-2 row-span-2 row-start-1 gap-1 self-start justify-self-end rounded-md bg-muted p-1">
                            <Button
                                size="sm"
                                variant={failuresOnly ? 'ghost' : 'secondary'}
                                onClick={() => setFailuresOnly(false)}
                                message={t('activity.trail.all')}
                            />

                            <Button
                                size="sm"
                                variant={failuresOnly ? 'secondary-destructive' : 'ghost'}
                                className={failuresOnly ? undefined : 'text-muted-foreground'}
                                onClick={() => setFailuresOnly(true)}
                                message={t('activity.trail.failures')}
                            />
                        </Stack>
                    </CardHeader>

                    <CardContent padding="none">
                        {error !== null && (
                            <Stack direction="Vertical" className="px-5">
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            </Stack>
                        )}

                        {entries === null && error === null && (
                            <Stack direction="Vertical" className="gap-2 px-5">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <Skeleton className="h-10" key={i} />
                                ))}
                            </Stack>
                        )}

                        {entries !== null && entries.length === 0 && (
                            <Stack direction="Vertical" className="px-5">
                                <EmptyState
                                    icon={Activity}
                                    title={t('activity.trail.emptyTitle')}
                                    description={t('activity.trail.emptyDescription')}
                                />
                            </Stack>
                        )}

                        {entries !== null && rows.length === 0 && entries.length > 0 && (
                            <Stack direction="Vertical" className="px-5">
                                <EmptyState
                                    icon={Activity}
                                    title={t('activity.trail.noFailuresTitle')}
                                    description={t('activity.trail.noFailuresDescription')}
                                />
                            </Stack>
                        )}

                        {rows.length > 0 && (
                            <Stack
                                direction="Vertical"
                                className="max-h-125 scroll-stable overflow-y-auto px-5 py-1">
                                {cards(rows)}
                            </Stack>
                        )}
                    </CardContent>

                    {page !== null && entries !== null && entries.length > 0 && (
                        <CardFooter className="border-t">
                            <Pager
                                page={page}
                                shown={entries.length}
                                busy={paging}
                                noun={t('activity.trail.entries')}
                                onPage={(offset) => void goTo(offset)}
                            />
                        </CardFooter>
                    )}
                </Card>

                <Card className="xl:sticky xl:top-32">
                    <CardHeader>
                        <CardTitle>
                            {selected === null
                                ? t('activity.detail.nothingSelected')
                                : trip === null
                                  ? actionText(selected.action)
                                  : t('activity.detail.roundTrip')}
                        </CardTitle>
                        <CardDescription>
                            {selected === null
                                ? t('activity.detail.pick')
                                : dateTimeLabel(selected.created_at)}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="grid gap-5">
                        {selected !== null && (
                            <>
                                <DataList>
                                    {trip !== null && trip.agent !== '' && (
                                        <DataRow
                                            label={t('activity.detail.agent')}
                                            value={trip.agent}
                                        />
                                    )}
                                    {trip !== null && trip.model !== '' && (
                                        <DataRow
                                            label={t('activity.detail.model')}
                                            value={trip.model}
                                        />
                                    )}
                                    {trip !== null && trip.messages !== '' && (
                                        <DataRow
                                            label={t('activity.detail.messagesIn')}
                                            value={numberLabel(Number(trip.messages))}
                                        />
                                    )}
                                    {trip === null && (
                                        <DataRow
                                            label={t('activity.detail.action')}
                                            value={actionText(selected.action)}
                                        />
                                    )}
                                    {trip === null && selected.target !== '' && (
                                        <DataRow
                                            label={t('activity.detail.target')}
                                            value={selected.target}
                                        />
                                    )}
                                    <DataRow
                                        label={t('activity.detail.actor')}
                                        value={selected.actor}
                                    />
                                    {selected.duration_ms > 0 && (
                                        <DataRow
                                            label={t('activity.detail.took')}
                                            value={t('common.milliseconds', {
                                                count: selected.duration_ms,
                                            })}
                                        />
                                    )}
                                </DataList>

                                <Stack direction="Vertical" className="gap-2">
                                    <Text
                                        type="BodyMuted"
                                        message={
                                            trip === null
                                                ? t('activity.detail.detail')
                                                : t('activity.detail.cameBack')
                                        }
                                    />

                                    <Text
                                        type={
                                            selected.outcome === 'error'
                                                ? 'DataDestructive'
                                                : 'DataMuted'
                                        }
                                        className={cn(
                                            'rounded-md border bg-well p-3 break-anywhere',
                                            selected.outcome === 'error' && 'border-destructive/40',
                                        )}
                                        message={
                                            trip !== null &&
                                            selected.outcome === 'ok' &&
                                            trip.chars !== ''
                                                ? trip.tools !== '' && trip.tools !== '0'
                                                    ? tn(
                                                          'activity.detail.textAfterTools',
                                                          Number(trip.tools),
                                                          { chars: Number(trip.chars) },
                                                      )
                                                    : t('activity.detail.text', {
                                                          chars: Number(trip.chars),
                                                      })
                                                : selected.detail !== ''
                                                  ? selected.detail
                                                  : t('activity.detail.nothingRecorded')
                                        }
                                    />
                                </Stack>

                                {selected.changes !== '' && (
                                    <Stack direction="Vertical" className="gap-2">
                                        <Text
                                            type="BodyMuted"
                                            message={t('activity.detail.changes')}
                                        />

                                        <Stack
                                            direction="Vertical"
                                            className="max-h-96 scroll-stable overflow-y-auto">
                                            <CodeBlock message={prettyJson(selected.changes)} />
                                        </Stack>
                                    </Stack>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </Stack>
        </Stack>
    );
}
