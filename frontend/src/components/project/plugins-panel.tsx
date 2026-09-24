import { Activity, FlaskConical, Plug, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
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
import { kindText } from '@/libs/catalog';
import { HEALTH_TONE, PLUGIN_ICONS } from '@/libs/constant';
import { dateTimeLabel, numberLabel } from '@/libs/format';
import { apiError, t, tn } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/ui/card';
import { ItemMedia } from '@/ui/item';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import type { Status } from '@/ui/status-dot';
import { Switch } from '@/ui/switch';
import { Text } from '@/ui/text';
import { PluginCallsDialog } from './plugin-calls-dialog';
import { PluginDialog } from './plugin-dialog';

function health(
    plugin: TeamPlugin,
    answering: string | undefined,
): { status: Status; line: string } {
    if (!plugin.enabled) {
        return { status: 'off', line: t('tools.health.off') };
    }

    if (plugin.listen_error !== '') {
        return { status: 'failed', line: plugin.listen_error };
    }

    if (plugin.account === '') {
        return { status: 'degraded', line: t('tools.health.notConnected') };
    }

    const values = { account: plugin.account, agent: answering ?? '' };

    return {
        status: 'live',
        line: plugin.listening
            ? answering === undefined
                ? t('tools.health.listening', values)
                : t('tools.health.listeningAnswered', values)
            : answering === undefined
              ? t('tools.health.connected', values)
              : t('tools.health.connectedAnswered', values),
    };
}

function Reading({
    label,
    value,
    failed = false,
}: {
    label: string;
    value: string;
    failed?: boolean;
}) {
    return (
        <Stack direction="Vertical" className="gap-1">
            <Text type="Caption" message={label} />
            <Text
                type="DataStrong"
                className={failed ? HEALTH_TONE.failed : undefined}
                message={value}
            />
        </Stack>
    );
}

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
            setError(apiError(cause, 'tools.errors.pluginsLoadFailed'));
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
            setError(apiError(cause, 'tools.errors.actionFailed'));
        } finally {
            setBusy(null);
        }
    };

    const agentName = (id: number) => agents.find((agent) => agent.id === id)?.name;

    const addButton = (
        <Button
            onClick={() => setEditing('new')}
            disabled={kinds.length === 0}
            icon={<Plus />}
            message={t('tools.plugins.add')}
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
                            ? t('tools.plugins.savedUntested', { name: plugin.name })
                            : t('tools.plugins.savedConnected', {
                                  name: plugin.name,
                                  account: plugin.account,
                              }),
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

            <Stack direction="Horizontal" className="flex-wrap items-center justify-between gap-3">
                <Text
                    type="BodyMuted"
                    message={
                        plugins === null
                            ? t('tools.plugins.loading')
                            : tn('tools.plugins.summary', plugins.length)
                    }
                />

                <Stack direction="Horizontal" className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => void load()}
                        icon={<RefreshCw />}
                        message={t('tools.plugins.refresh')}
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
                        <Skeleton radius="xl" className="h-56" key={i} />
                    ))}
                </Stack>
            )}

            {plugins !== null && plugins.length === 0 && (
                <EmptyState
                    icon={Plug}
                    title={t('tools.plugins.empty.title')}
                    description={t('tools.plugins.empty.description')}
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
                        const state = health(
                            plugin,
                            plugin.hook_agent_id === 0
                                ? undefined
                                : agentName(plugin.hook_agent_id),
                        );
                        const switchId = `plugin-on-${plugin.id}`;
                        const { stats } = plugin;

                        return (
                            <Stack direction="Vertical" as="li" key={plugin.id}>
                                <Card gap={4} signal={state.status} className="h-full">
                                    <CardHeader>
                                        <CardTitle className="flex min-w-0 items-center gap-3">
                                            <ItemMedia variant="icon">
                                                <Icon />
                                            </ItemMedia>
                                            <Text
                                                type="Foreground"
                                                as="span"
                                                className="min-w-0 truncate"
                                                message={plugin.name}
                                            />
                                        </CardTitle>
                                        <CardDescription>
                                            {kind === undefined
                                                ? plugin.kind
                                                : kindText(kind.key, 'label', kind.label)}
                                        </CardDescription>
                                        <CardAction className="flex items-center gap-2">
                                            <Switch
                                                id={switchId}
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
                                                htmlFor={switchId}
                                                message={
                                                    plugin.enabled
                                                        ? t('tools.plugins.on')
                                                        : t('tools.plugins.off')
                                                }
                                            />
                                        </CardAction>
                                    </CardHeader>

                                    <CardContent className="grid gap-4">
                                        <Text
                                            type="Body"
                                            className={HEALTH_TONE[state.status]}
                                            message={state.line}
                                        />

                                        <Stack
                                            direction="Horizontal"
                                            className="flex-wrap gap-x-8 gap-y-3">
                                            <Reading
                                                label={t('tools.stats.week')}
                                                value={numberLabel(stats.week)}
                                            />
                                            <Reading
                                                label={t('tools.stats.failed')}
                                                value={
                                                    stats.failures === 0
                                                        ? numberLabel(0)
                                                        : t('tools.stats.failedOf', {
                                                              failures: stats.failures,
                                                              requests: stats.requests,
                                                          })
                                                }
                                                failed={stats.failures > 0}
                                            />
                                            {kind !== undefined && kind.inbound !== 'none' && (
                                                <Reading
                                                    label={t('tools.stats.received')}
                                                    value={numberLabel(stats.inbound)}
                                                />
                                            )}
                                            <Reading
                                                label={t('tools.stats.lastUsed')}
                                                value={
                                                    stats.last_at === null
                                                        ? t('tools.stats.never')
                                                        : dateTimeLabel(stats.last_at, {
                                                              dateStyle: 'short',
                                                              timeStyle: 'short',
                                                          })
                                                }
                                            />
                                        </Stack>

                                        {users.length === 0 ? (
                                            <Text
                                                type="BodyMuted"
                                                message={t('tools.plugins.noUsers')}
                                            />
                                        ) : (
                                            <Stack
                                                direction="Horizontal"
                                                as="ul"
                                                className="m-0 list-none flex-wrap gap-1.5 p-0">
                                                {users.map((name) => (
                                                    <Stack direction="Vertical" as="li" key={name}>
                                                        <Badge variant="secondary">{name}</Badge>
                                                    </Stack>
                                                ))}
                                            </Stack>
                                        )}

                                        {plugin.hook_url !== '' && (
                                            <Stack
                                                direction="Horizontal"
                                                className="min-w-0 items-baseline gap-1.5">
                                                <Text
                                                    type="Caption"
                                                    as="span"
                                                    className="shrink-0"
                                                    message={t('tools.plugins.sendsTo')}
                                                />
                                                <Text
                                                    type="DataMuted"
                                                    as="span"
                                                    className="truncate"
                                                    message={plugin.hook_url}
                                                />
                                            </Stack>
                                        )}
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
                                                            tested.plugin.account === ''
                                                                ? t('tools.plugins.works', {
                                                                      name: plugin.name,
                                                                  })
                                                                : t('tools.plugins.worksAs', {
                                                                      name: plugin.name,
                                                                      account:
                                                                          tested.plugin.account,
                                                                  }),
                                                        );
                                                    } else {
                                                        setError(
                                                            t('tools.plugins.testFailed', {
                                                                name: plugin.name,
                                                                error: tested.error,
                                                            }),
                                                        );
                                                    }
                                                })
                                            }
                                            message={
                                                busy === plugin.id
                                                    ? t('tools.plugins.testing')
                                                    : t('tools.plugins.test')
                                            }
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            icon={<Activity />}
                                            onClick={() => setViewing(plugin)}
                                            message={t('tools.plugins.activity')}
                                        />

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditing(plugin)}
                                            message={t('tools.plugins.modify')}
                                        />

                                        <Stack direction="Horizontal" as="span" className="grow" />

                                        <ConfirmButton
                                            label={t('tools.plugins.remove')}
                                            title={t('tools.plugins.removeTitle', {
                                                name: plugin.name,
                                            })}
                                            description={t('tools.plugins.removeDescription')}
                                            confirmLabel={t('tools.plugins.removeConfirm')}
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
