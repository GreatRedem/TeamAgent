import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    type Paged,
    type PluginActionStats,
    type PluginCall,
    pluginCalls,
    type TeamPlugin,
} from '@/apis';
import { Pager } from '@/components/pager';
import { Stat } from '@/components/stat';
import { PLUGIN_DIRECTIONS } from '@/libs/constant';
import { compactCount, dateTimeLabel, durationLabel, numberLabel } from '@/libs/format';
import { apiError, t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { CodeBlock } from '@/ui/code-block';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table';
import { Text } from '@/ui/text';

function pretty(text: string): string {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

export function PluginCallsDialog({
    teamId,
    plugin,
    onOpenChange,
}: {
    teamId: number;
    plugin: TeamPlugin | null;
    onOpenChange: (open: boolean) => void;
}) {
    const [calls, setCalls] = useState<PluginCall[] | null>(null);
    const [actions, setActions] = useState<PluginActionStats[]>([]);
    const [page, setPage] = useState<Paged | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const pluginId = plugin?.id;

    const load = useCallback(
        async (offset: number) => {
            if (pluginId === undefined) {
                return;
            }

            setBusy(true);

            try {
                const payload = await pluginCalls(teamId, pluginId, { offset });

                setCalls(payload.calls);
                setActions(payload.actions);
                setPage(payload);
                setError(null);
            } catch (cause) {
                setCalls((current) => current ?? []);
                setError(apiError(cause, 'tools.errors.activityLoadFailed'));
            } finally {
                setBusy(false);
            }
        },
        [teamId, pluginId],
    );

    useEffect(() => {
        setCalls(null);
        setActions([]);
        setExpanded(new Set());

        void load(0);
    }, [load]);

    const toggle = (id: number) =>
        setExpanded((current) => {
            const next = new Set(current);

            if (!next.delete(id)) {
                next.add(id);
            }

            return next;
        });

    const stats = plugin?.stats;

    return (
        <Dialog open={plugin !== null} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{plugin?.name ?? t('tools.calls.title')}</DialogTitle>
                    <DialogDescription>{t('tools.calls.description')}</DialogDescription>
                </DialogHeader>

                {stats !== undefined && (
                    <Stack direction="Vertical" className="gap-3 sm:grid sm:grid-cols-4">
                        <Stat
                            label={t('tools.calls.requests')}
                            value={compactCount(stats.requests)}
                            note={t('tools.calls.requestsNote', {
                                day: stats.day,
                                week: stats.week,
                            })}
                        />
                        <Stat
                            label={t('tools.calls.failed')}
                            value={compactCount(stats.failures)}
                            tone="destructive"
                            meter={
                                stats.requests === 0 ? 0 : (stats.failures / stats.requests) * 100
                            }
                            note={
                                stats.requests === 0
                                    ? t('tools.calls.nothingSent')
                                    : t('tools.calls.failedShare', {
                                          percent: Math.round(
                                              (stats.failures / stats.requests) * 100,
                                          ),
                                      })
                            }
                        />
                        <Stat
                            label={t('tools.calls.received')}
                            value={compactCount(stats.inbound)}
                            note={t('tools.calls.repliesNote', { replies: stats.replies })}
                        />
                        <Stat
                            label={t('tools.calls.average')}
                            value={stats.average_ms === 0 ? '–' : durationLabel(stats.average_ms)}
                            note={t('tools.calls.averageNote')}
                        />
                    </Stack>
                )}

                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {actions.length > 0 && (
                    <Stack direction="Vertical" className="gap-2">
                        <Text type="BodyStrong" message={t('tools.calls.byAction')} />
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('tools.calls.column.action')}</TableHead>
                                    <TableHead>{t('tools.calls.column.kind')}</TableHead>
                                    <TableHead className="text-end">
                                        {t('tools.calls.column.count')}
                                    </TableHead>
                                    <TableHead className="text-end">
                                        {t('tools.calls.column.failed')}
                                    </TableHead>
                                    <TableHead className="text-end">
                                        {t('tools.calls.column.average')}
                                    </TableHead>
                                    <TableHead className="text-end">
                                        {t('tools.calls.column.last')}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {actions.map((row) => (
                                    <TableRow key={`${row.direction}:${row.action}`}>
                                        <TableCell>
                                            <Text type="Data" as="span" message={row.action} />
                                        </TableCell>
                                        <TableCell>
                                            <Text
                                                type="BodyMuted"
                                                as="span"
                                                message={t(PLUGIN_DIRECTIONS[row.direction])}
                                            />
                                        </TableCell>
                                        <TableCell className="text-end">
                                            <Text
                                                type="Data"
                                                as="span"
                                                message={numberLabel(row.count)}
                                            />
                                        </TableCell>
                                        <TableCell className="text-end">
                                            <Text
                                                type={
                                                    row.failures > 0
                                                        ? 'DataDestructive'
                                                        : 'DataMuted'
                                                }
                                                as="span"
                                                message={numberLabel(row.failures)}
                                            />
                                        </TableCell>
                                        <TableCell className="text-end">
                                            <Text
                                                type="DataMuted"
                                                as="span"
                                                message={
                                                    row.average_ms === 0
                                                        ? '–'
                                                        : durationLabel(row.average_ms)
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-end">
                                            <Text
                                                type="DataMuted"
                                                as="time"
                                                dateTime={row.last_at}
                                                message={dateTimeLabel(row.last_at)}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Stack>
                )}

                <Stack direction="Horizontal" className="items-center justify-between gap-3">
                    <Text type="BodyStrong" message={t('tools.calls.recent')} />
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void load(page?.offset ?? 0)}
                        icon={<RefreshCw />}
                        message={t('tools.calls.refresh')}
                    />
                </Stack>

                {calls === null && <Skeleton radius="lg" className="h-32" />}

                {calls !== null && calls.length === 0 && (
                    <Text type="BodyMuted" message={t('tools.calls.empty')} />
                )}

                {calls?.map((call) => {
                    const open = expanded.has(call.id);

                    return (
                        <Stack
                            direction="Vertical"
                            className="gap-2 rounded-lg border px-4 py-3"
                            key={call.id}>
                            <Stack direction="Horizontal" className="flex-wrap items-center gap-2">
                                <Badge variant={call.ok ? 'secondary' : 'destructive'}>
                                    {call.ok ? t('tools.calls.ok') : t('tools.calls.failedBadge')}
                                </Badge>
                                <Badge variant="outline">
                                    {t(PLUGIN_DIRECTIONS[call.direction])}
                                </Badge>
                                <Text type="DataStrong" as="span" message={call.action} />
                                {call.agent_name !== '' && (
                                    <Text type="BodyMuted" as="span" message={call.agent_name} />
                                )}
                                <Stack direction="Horizontal" as="span" className="grow" />
                                {call.direction !== 'in' && (
                                    <Text
                                        type="DataMuted"
                                        as="span"
                                        message={
                                            call.status === 0
                                                ? t('tools.calls.noAnswer', {
                                                      duration: durationLabel(call.duration_ms),
                                                  })
                                                : t('tools.calls.status', {
                                                      status: String(call.status),
                                                      duration: durationLabel(call.duration_ms),
                                                  })
                                        }
                                    />
                                )}
                                <Text
                                    type="DataMuted"
                                    as="time"
                                    dateTime={call.created_at}
                                    message={dateTimeLabel(call.created_at)}
                                />
                            </Stack>

                            {call.error !== '' && (
                                <Text
                                    type="Body"
                                    className="text-destructive"
                                    message={call.error}
                                />
                            )}

                            {(call.request !== '' || call.response !== '') && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="self-start"
                                    onClick={() => toggle(call.id)}
                                    message={
                                        open
                                            ? t('tools.calls.hideDetails')
                                            : t('tools.calls.showDetails')
                                    }
                                />
                            )}

                            {open && call.request !== '' && (
                                <Stack direction="Vertical" className="gap-1">
                                    <Text
                                        type="Caption"
                                        message={
                                            call.direction === 'in'
                                                ? t('tools.calls.arrived')
                                                : t('tools.calls.sent')
                                        }
                                    />
                                    <CodeBlock message={pretty(call.request)} />
                                </Stack>
                            )}

                            {open && call.response !== '' && (
                                <Stack direction="Vertical" className="gap-1">
                                    <Text
                                        type="Caption"
                                        message={
                                            call.direction === 'in'
                                                ? t('tools.calls.from')
                                                : call.direction === 'reply'
                                                  ? t('tools.calls.reply')
                                                  : t('tools.calls.answer')
                                        }
                                    />
                                    <CodeBlock message={pretty(call.response)} />
                                </Stack>
                            )}
                        </Stack>
                    );
                })}

                {page !== null && calls !== null && calls.length > 0 && (
                    <Pager
                        page={page}
                        shown={calls.length}
                        busy={busy}
                        noun={t('tools.calls.noun')}
                        onPage={(offset) => void load(offset)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
