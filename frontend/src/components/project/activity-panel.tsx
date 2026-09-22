import { Activity } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    ApiError,
    type AuditEntry,
    auditHeatmap,
    auditList,
    type HeatmapDay,
    type Paged,
} from '@/apis';
import { DataList, DataRow } from '@/components/data-value';
import { EmptyState } from '@/components/empty-state';
import { Pager } from '@/components/pager';
import { cn } from '@/libs/cn';
import { AUDIT_RESULT } from '@/libs/constant';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table';
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
    return new Date(iso).toLocaleTimeString(undefined, {
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
                    setError(
                        cause instanceof ApiError
                            ? cause.result
                            : 'The activity trail could not be loaded.',
                    );
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
                setError(
                    cause instanceof ApiError
                        ? cause.result
                        : 'The activity trail could not be loaded.',
                );
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

    return (
        <Stack direction="Vertical" className="gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Twelve weeks of activity</CardTitle>
                    <CardDescription>
                        {heatmap === null
                            ? 'Counting what this project has done.'
                            : `${heatmap.total.toLocaleString()} action${heatmap.total === 1 ? '' : 's'} recorded${heatmap.busiest > 0 ? `, ${heatmap.busiest} on the busiest day` : ''}.`}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {heatmap === null ? (
                        <Skeleton radius="lg" className="h-28" />
                    ) : (
                        <Heatmap days={heatmap.days} busiest={heatmap.busiest} />
                    )}
                </CardContent>
            </Card>

            <Stack
                direction="Vertical"
                className="xl:items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:grid">
                <Card className="overflow-hidden">
                    <CardHeader>
                        <CardTitle>Trail</CardTitle>
                        <CardDescription>
                            What was sent, what came back, and how long it took.
                        </CardDescription>

                        <Stack
                            direction="Horizontal"
                            className="col-start-2 row-span-2 row-start-1 gap-1 self-start justify-self-end rounded-md bg-muted p-1">
                            <Button
                                type="button"
                                size="sm"
                                variant={failuresOnly ? 'ghost' : 'secondary'}
                                aria-pressed={!failuresOnly}
                                onClick={() => setFailuresOnly(false)}
                                message="All"
                            />

                            <Button
                                type="button"
                                size="sm"
                                variant={failuresOnly ? 'secondary-destructive' : 'ghost'}
                                aria-pressed={failuresOnly}
                                className={failuresOnly ? undefined : 'text-muted-foreground'}
                                onClick={() => setFailuresOnly(true)}
                                message="Failures"
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
                                    title="Nothing has happened yet"
                                    description="Every model run and every change to this project will show up here."
                                />
                            </Stack>
                        )}

                        {entries !== null && rows.length === 0 && entries.length > 0 && (
                            <Stack direction="Vertical" className="px-5">
                                <EmptyState
                                    icon={Activity}
                                    title="No failures on this page"
                                    description="Every run on this page finished cleanly."
                                />
                            </Stack>
                        )}

                        {rows.length > 0 && (
                            <Table>
                                <TableHeader>
                                    <TableRow hoverable={false}>
                                        <TableHead className="ps-5">Time</TableHead>
                                        <TableHead>Who</TableHead>
                                        <TableHead className="hidden md:table-cell">What</TableHead>
                                        <TableHead className="hidden lg:table-cell">Size</TableHead>
                                        <TableHead numeric>ms</TableHead>
                                        <TableHead numeric className="pe-5">
                                            Result
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {rows.map((entry) => {
                                        const row = roundTrip(entry);
                                        const result = AUDIT_RESULT[entry.outcome];
                                        const open = selected?.id === entry.id;

                                        return (
                                            <TableRow
                                                key={entry.id}
                                                data-state={open ? 'selected' : undefined}
                                                className="cursor-pointer"
                                                onClick={() => setSelectedId(entry.id)}>
                                                <TableCell className="ps-5">
                                                    <button
                                                        type="button"
                                                        aria-pressed={open}
                                                        aria-label={`Show the entry from ${clock(entry.created_at)}`}
                                                        className="cursor-pointer border-0 bg-transparent p-0 font-mono text-2xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                                        onClick={() => setSelectedId(entry.id)}>
                                                        {clock(entry.created_at)}
                                                    </button>
                                                </TableCell>
                                                <TableCell className="max-w-[10rem] truncate">
                                                    {row !== null && row.agent !== ''
                                                        ? row.agent
                                                        : entry.actor}
                                                </TableCell>
                                                <TableCell className="hidden max-w-[14rem] truncate font-mono text-2xs text-muted-foreground md:table-cell">
                                                    {row !== null && row.model !== ''
                                                        ? row.model
                                                        : entry.action}
                                                </TableCell>
                                                <TableCell className="hidden max-w-[12rem] truncate font-mono text-2xs text-muted-foreground lg:table-cell">
                                                    {row !== null && row.messages !== ''
                                                        ? `${Number(row.messages).toLocaleString()} in / ${Number(row.chars).toLocaleString()} chars`
                                                        : entry.target}
                                                </TableCell>
                                                <TableCell
                                                    numeric
                                                    className={cn(
                                                        'font-mono text-2xs',
                                                        entry.outcome === 'error'
                                                            ? 'text-destructive'
                                                            : 'text-muted-foreground',
                                                    )}>
                                                    {entry.duration_ms > 0
                                                        ? entry.duration_ms.toLocaleString()
                                                        : '—'}
                                                </TableCell>
                                                <TableCell
                                                    numeric
                                                    className={cn(
                                                        'pe-5 font-medium',
                                                        result.className,
                                                    )}>
                                                    {result.label}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>

                    {page !== null && entries !== null && entries.length > 0 && (
                        <CardFooter className="border-t">
                            <Pager
                                page={page}
                                shown={entries.length}
                                busy={paging}
                                noun="entries"
                                onPage={(offset) => void goTo(offset)}
                            />
                        </CardFooter>
                    )}
                </Card>

                <Card className="xl:sticky xl:top-32">
                    <CardHeader>
                        <CardTitle>
                            {selected === null
                                ? 'Nothing selected'
                                : trip === null
                                  ? selected.action
                                  : 'Model round-trip'}
                        </CardTitle>
                        <CardDescription>
                            {selected === null
                                ? 'Pick a row to see the detail.'
                                : new Date(selected.created_at).toLocaleString()}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="grid gap-5">
                        {selected !== null && (
                            <>
                                <DataList>
                                    {trip !== null && trip.agent !== '' && (
                                        <DataRow label="Agent" value={trip.agent} />
                                    )}
                                    {trip !== null && trip.model !== '' && (
                                        <DataRow label="Model" value={trip.model} />
                                    )}
                                    {trip !== null && trip.messages !== '' && (
                                        <DataRow
                                            label="Messages in"
                                            value={Number(trip.messages).toLocaleString()}
                                        />
                                    )}
                                    {trip === null && (
                                        <DataRow label="Action" value={selected.action} />
                                    )}
                                    {trip === null && selected.target !== '' && (
                                        <DataRow label="Target" value={selected.target} />
                                    )}
                                    <DataRow label="Actor" value={selected.actor} />
                                    {selected.duration_ms > 0 && (
                                        <DataRow
                                            label="Took"
                                            value={`${selected.duration_ms.toLocaleString()} ms`}
                                        />
                                    )}
                                </DataList>

                                <Stack direction="Vertical" className="gap-2">
                                    <Text
                                        type="BodyMuted"
                                        message={trip === null ? 'Detail' : 'Came back'}
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
                                                ? `${Number(trip.chars).toLocaleString()} characters of text${trip.tools !== '' && trip.tools !== '0' ? ` after ${trip.tools} tool call${trip.tools === '1' ? '' : 's'}` : ''}`
                                                : selected.detail !== ''
                                                  ? selected.detail
                                                  : 'Nothing was recorded.'
                                        }
                                    />
                                </Stack>
                            </>
                        )}
                    </CardContent>
                </Card>
            </Stack>
        </Stack>
    );
}
