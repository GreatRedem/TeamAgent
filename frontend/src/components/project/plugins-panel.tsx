import { Activity, FlaskConical, Plug, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    ApiError,
    agentList,
    type PluginKind,
    pluginCatalog,
    pluginList,
    pluginRemove,
    pluginTest,
    pluginUpdate,
    type TeamAgent,
    type TeamPlugin,
} from '@/apis';
import { ConfirmButton } from '@/components/confirm-button';
import { EmptyState } from '@/components/empty-state';
import { Stat } from '@/components/stat';
import { PLUGIN_ERRORS, PLUGIN_ICONS } from '@/libs/constant';
import { compactCount, durationLabel } from '@/libs/format';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { DataList } from '@/ui/data-value';
import { ItemMedia } from '@/ui/item';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { StatusDot } from '@/ui/status-dot';
import { Switch } from '@/ui/switch';
import { Text } from '@/ui/text';

import { PluginCallsDialog } from './plugin-calls-dialog';
import { PluginDialog } from './plugin-dialog';

export function PluginsPanel({ teamId }: { teamId: number }) {
    const [plugins, setPlugins] = useState<TeamPlugin[] | null>(null);
    const [kinds, setKinds] = useState<PluginKind[]>([]);
    const [events, setEvents] = useState<string[]>([]);
    const [agents, setAgents] = useState<TeamAgent[]>([]);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [editing, setEditing] = useState<TeamPlugin | 'new' | null>(null);
    const [viewing, setViewing] = useState<TeamPlugin | null>(null);

    const load = useCallback(async () => {
        try {
            setPlugins((await pluginList(teamId)).plugins);
        } catch (cause) {
            setPlugins((current) => current ?? []);
            setError(cause instanceof ApiError ? cause.result : 'The plugins could not be loaded.');
        }
    }, [teamId]);

    useEffect(() => {
        void load();

        pluginCatalog(teamId)
            .then((catalog) => {
                setKinds(catalog.kinds);
                setEvents(catalog.events);
            })
            .catch(() => setKinds([]));

        agentList(teamId, { limit: 200 })
            .then((payload) => setAgents(payload.agents))
            .catch(() => setAgents([]));
    }, [teamId, load]);

    const replace = (plugin: TeamPlugin) =>
        setPlugins((current) =>
            current?.some((item) => item.id === plugin.id)
                ? current.map((item) => (item.id === plugin.id ? plugin : item))
                : [...(current ?? []), plugin],
        );

    const act = async (pluginId: number, run: () => Promise<unknown>) => {
        setError(null);
        setNotice(null);
        setBusy(pluginId);

        try {
            await run();
        } catch (cause) {
            setError(
                cause instanceof ApiError
                    ? (PLUGIN_ERRORS[cause.result] ?? cause.result)
                    : 'That did not work.',
            );
        } finally {
            setBusy(null);
        }
    };

    const agentName = (id: number) => agents.find((agent) => agent.id === id)?.name;

    const total = (plugins ?? []).reduce(
        (sum, plugin) => ({
            requests: sum.requests + plugin.stats.requests,
            failures: sum.failures + plugin.stats.failures,
            inbound: sum.inbound + plugin.stats.inbound,
            replies: sum.replies + plugin.stats.replies,
            day: sum.day + plugin.stats.day,
            week: sum.week + plugin.stats.week,
        }),
        { requests: 0, failures: 0, inbound: 0, replies: 0, day: 0, week: 0 },
    );

    const addButton = (
        <Button
            onClick={() => setEditing('new')}
            disabled={kinds.length === 0}
            icon={<Plus />}
            message="Add plugin"
        />
    );

    return (
        <Stack direction="Vertical" as="section" className="gap-4">
            <PluginDialog
                open={editing !== null}
                teamId={teamId}
                plugin={editing === 'new' ? null : editing}
                kinds={kinds}
                events={events}
                agents={agents}
                onOpenChange={(next) => {
                    if (!next) {
                        setEditing(null);
                    }
                }}
                onSaved={(plugin) => {
                    replace(plugin);
                    setNotice(
                        plugin.account === ''
                            ? `${plugin.name} is saved, but its test did not pass yet. Open Activity to see why.`
                            : `${plugin.name} is saved and connected as ${plugin.account}.`,
                    );
                }}
            />

            <PluginCallsDialog
                teamId={teamId}
                plugin={viewing}
                onOpenChange={(next) => {
                    if (!next) {
                        setViewing(null);
                    }
                }}
            />

            {plugins !== null && plugins.length > 0 && (
                <Stack direction="Vertical" className="gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
                    <Stat
                        label="Requests"
                        value={compactCount(total.requests)}
                        note={`${total.day.toLocaleString()} today · ${total.week.toLocaleString()} this week`}
                    />
                    <Stat
                        label="Failed"
                        value={compactCount(total.failures)}
                        tone="destructive"
                        meter={total.requests === 0 ? 0 : (total.failures / total.requests) * 100}
                        note={
                            total.requests === 0
                                ? 'Nothing sent yet'
                                : `${Math.round((total.failures / total.requests) * 100)}% of requests`
                        }
                    />
                    <Stat
                        label="Received"
                        value={compactCount(total.inbound)}
                        note="Messages and comments that came in"
                    />
                    <Stat
                        label="Answered"
                        value={compactCount(total.replies)}
                        note="Replied to by an agent"
                    />
                </Stack>
            )}

            <Stack direction="Horizontal" className="flex-wrap items-center justify-between gap-3">
                <Text
                    type="BodyMuted"
                    message={
                        plugins === null
                            ? 'Loading plugins.'
                            : `${plugins.length} plugin${plugins.length === 1 ? '' : 's'}. An agent can use a plugin once you let it; a plugin with an agent under Hooks also answers what comes in.`
                    }
                />

                <Stack direction="Horizontal" className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => void load()}
                        icon={<RefreshCw />}
                        message="Refresh"
                    />
                    {addButton}
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

            {plugins === null && (
                <Stack direction="Vertical" className="gap-3 sm:grid sm:grid-cols-2">
                    {[0, 1].map((i) => (
                        <Skeleton radius="xl" className="h-64" key={i} />
                    ))}
                </Stack>
            )}

            {plugins !== null && plugins.length === 0 && (
                <EmptyState
                    icon={Plug}
                    title="No plugins yet"
                    description="Connect Telegram, Discord, Instagram, a web browser or a webhook, and let your agents post, reply and look things up there."
                    action={addButton}
                />
            )}

            {plugins !== null && plugins.length > 0 && (
                <Stack
                    direction="Vertical"
                    as="ul"
                    className="m-0 list-none gap-3 p-0 sm:grid sm:grid-cols-2">
                    {plugins.map((plugin) => {
                        const kind = kinds.find((candidate) => candidate.key === plugin.kind);
                        const Icon = PLUGIN_ICONS[plugin.kind] ?? Plug;
                        const users = plugin.agents
                            .map(agentName)
                            .filter((name): name is string => name !== undefined);
                        const answering =
                            plugin.hook_agent_id === 0
                                ? undefined
                                : agentName(plugin.hook_agent_id);
                        const status = !plugin.enabled
                            ? { label: 'Off', variant: 'outline' as const }
                            : plugin.listen_error !== ''
                              ? { label: 'Needs attention', variant: 'destructive' as const }
                              : plugin.listening
                                ? { label: 'Listening', variant: 'default' as const }
                                : { label: 'On', variant: 'secondary' as const };

                        return (
                            <Stack direction="Vertical" as="li" key={plugin.id}>
                                <Card gap={3} className="h-full">
                                    <CardHeader>
                                        <CardTitle className="flex min-w-0 items-center gap-3">
                                            <ItemMedia variant="icon">
                                                <Icon />
                                            </ItemMedia>
                                            <Text
                                                type="Foreground"
                                                as="span"
                                                className="min-w-0 grow truncate"
                                                message={plugin.name}
                                            />
                                            <Badge variant={status.variant} className="gap-1.5">
                                                {plugin.listening && plugin.enabled && (
                                                    <StatusDot status="live" />
                                                )}
                                                {status.label}
                                            </Badge>
                                        </CardTitle>
                                        <CardDescription>
                                            {plugin.account === ''
                                                ? `${kind?.label ?? plugin.kind} · not connected yet; run Test`
                                                : `${kind?.label ?? plugin.kind} · ${plugin.account}`}
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent className="grid gap-3">
                                        {plugin.listen_error !== '' && (
                                            <Text
                                                type="Body"
                                                className="text-destructive"
                                                message={plugin.listen_error}
                                            />
                                        )}

                                        <DataList dense>
                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Used by"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={
                                                    users.length === 0
                                                        ? 'No agent yet'
                                                        : users.join(', ')
                                                }
                                            />

                                            {kind !== undefined && kind.inbound !== 'none' && (
                                                <>
                                                    <Text
                                                        type="ForegroundMuted"
                                                        as="dt"
                                                        message="Answers"
                                                    />
                                                    <Text
                                                        type="Data"
                                                        as="dd"
                                                        className="truncate"
                                                        message={
                                                            answering === undefined
                                                                ? 'Nobody'
                                                                : `${answering}, ${plugin.stats.replies.toLocaleString()} of ${plugin.stats.inbound.toLocaleString()} received`
                                                        }
                                                    />
                                                </>
                                            )}

                                            {plugin.hook_url !== '' && (
                                                <>
                                                    <Text
                                                        type="ForegroundMuted"
                                                        as="dt"
                                                        message="Forwards to"
                                                    />
                                                    <Text
                                                        type="Data"
                                                        as="dd"
                                                        className="truncate"
                                                        message={`${plugin.hook_url} · ${plugin.hook_events.length} event${plugin.hook_events.length === 1 ? '' : 's'}`}
                                                    />
                                                </>
                                            )}

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Requests"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={`${plugin.stats.requests.toLocaleString()} · ${plugin.stats.day.toLocaleString()} today · ${plugin.stats.week.toLocaleString()} this week`}
                                            />

                                            <Text type="ForegroundMuted" as="dt" message="Failed" />
                                            <Text
                                                type={
                                                    plugin.stats.failures > 0
                                                        ? 'DataDestructive'
                                                        : 'Data'
                                                }
                                                as="dd"
                                                message={
                                                    plugin.stats.requests === 0
                                                        ? 'None yet'
                                                        : `${plugin.stats.failures.toLocaleString()} (${Math.round((plugin.stats.failures / plugin.stats.requests) * 100)}%)`
                                                }
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Average"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={
                                                    plugin.stats.average_ms === 0
                                                        ? '–'
                                                        : durationLabel(plugin.stats.average_ms)
                                                }
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Last used"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={
                                                    plugin.stats.last_at === null
                                                        ? 'Never'
                                                        : new Date(
                                                              plugin.stats.last_at,
                                                          ).toLocaleString()
                                                }
                                            />
                                        </DataList>
                                    </CardContent>

                                    <CardFooter className="mt-auto flex-wrap items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={busy === plugin.id}
                                            icon={<FlaskConical />}
                                            onClick={() =>
                                                void act(plugin.id, async () => {
                                                    const tested = await pluginTest(
                                                        teamId,
                                                        plugin.id,
                                                    );

                                                    replace(tested.plugin);

                                                    if (tested.ok) {
                                                        setNotice(
                                                            `${plugin.name} works${tested.account === '' ? '' : `: ${tested.account}`}.`,
                                                        );
                                                    } else {
                                                        setError(
                                                            `${plugin.name} did not pass: ${tested.error}`,
                                                        );
                                                    }
                                                })
                                            }
                                            message={busy === plugin.id ? 'Testing…' : 'Test'}
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            icon={<Activity />}
                                            onClick={() => setViewing(plugin)}
                                            message="Activity"
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditing(plugin)}
                                            message="Modify"
                                        />

                                        <Switch
                                            id={`plugin-on-${plugin.id}`}
                                            checked={plugin.enabled}
                                            disabled={busy === plugin.id}
                                            onCheckedChange={(enabled) =>
                                                void act(plugin.id, async () =>
                                                    replace(
                                                        await pluginUpdate(teamId, plugin.id, {
                                                            name: plugin.name,
                                                            enabled,
                                                            fields: plugin.config,
                                                            clear: [],
                                                            agents: plugin.agents,
                                                            hook_agent_id: plugin.hook_agent_id,
                                                            hook_url: plugin.hook_url,
                                                            hook_events: plugin.hook_events,
                                                        }),
                                                    ),
                                                )
                                            }
                                        />
                                        <Text
                                            type="Body"
                                            as="label"
                                            htmlFor={`plugin-on-${plugin.id}`}
                                            message={plugin.enabled ? 'On' : 'Off'}
                                        />

                                        <Stack direction="Horizontal" as="span" className="grow" />

                                        <ConfirmButton
                                            label="Remove"
                                            title={`Remove ${plugin.name}?`}
                                            description="Agents lose its tools, it stops answering, and the record of its requests is deleted. Posts it already made stay where they are."
                                            confirmLabel="Remove plugin"
                                            onConfirm={() =>
                                                void act(plugin.id, async () => {
                                                    await pluginRemove(teamId, plugin.id);
                                                    setPlugins(
                                                        (current) =>
                                                            current?.filter(
                                                                (item) => item.id !== plugin.id,
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
        </Stack>
    );
}
