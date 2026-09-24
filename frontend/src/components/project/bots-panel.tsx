import { MessageSquare, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    agentList,
    type Paged,
    type TeamAgent,
    type TeamBot,
    type TeamBotProbe,
    teamBotCreate,
    teamBotList,
    teamBotRemove,
    teamBotTest,
    teamBotUpdate,
    teamBotWebhookRegister,
} from '@/apis';
import { ConfirmButton } from '@/components/confirm-button';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { Pager } from '@/components/pager';
import { ProfilePicker } from '@/components/profile-picker';
import { PROBE_TONE } from '@/libs/constant';
import { apiError, t, tk, tn } from '@/libs/i18n';
import { profileName } from '@/libs/profileName';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { DataList } from '@/ui/data-value';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Select, SelectItem } from '@/ui/select';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { type Status, StatusDot } from '@/ui/status-dot';
import { Switch } from '@/ui/switch';
import { Text } from '@/ui/text';

function probeState(probe: TeamBotProbe | 'testing'): string {
    if (probe === 'testing') {
        return 'pending';
    }

    return probe.ok ? 'ok' : 'error';
}

function probeLabel(probe: TeamBotProbe | 'testing', groups: boolean): string {
    if (probe === 'testing') {
        return t('bots.probe.asking');
    }

    if (!probe.ok) {
        return probe.reason === undefined
            ? t('bots.probe.refused')
            : tk(`errors.${probe.reason}`, probe.reason);
    }

    const connected =
        probe.username !== undefined && probe.username !== ''
            ? t('bots.probe.connectedAs', { username: probe.username })
            : t('bots.probe.connected');

    return groups && probe.reads_groups === false
        ? t('bots.probe.privacy', { connected })
        : connected;
}

function dotState(probe: TeamBotProbe | 'testing' | undefined): Status {
    if (probe === 'testing') {
        return 'degraded';
    }

    if (probe === undefined) {
        return 'off';
    }

    return probe.ok ? 'live' : 'failed';
}

export function BotsPanel({ teamId }: { teamId: number }) {
    const [bots, setBots] = useState<TeamBot[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [agents, setAgents] = useState<TeamAgent[]>([]);

    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [token, setToken] = useState('');
    const [publicUrl, setPublicUrl] = useState('');

    const [drafts, setDrafts] = useState<Record<number, string>>({});
    const [tokens, setTokens] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [probes, setProbes] = useState<Record<number, TeamBotProbe | 'testing'>>({});

    useEffect(() => {
        let active = true;

        Promise.all([teamBotList(teamId), agentList(teamId)])
            .then(([botPayload, agentPayload]) => {
                if (active) {
                    setBots(botPayload.bots);
                    setPage(botPayload);
                    setAgents(agentPayload.agents);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setBots([]);
                    setError(apiError(cause, 'bots.errors.loadFailed'));
                }
            });

        return () => {
            active = false;
        };
    }, [teamId]);

    const add = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();

            setFormError(null);
            setBusy(true);

            try {
                const bot = await teamBotCreate(
                    teamId,
                    name.trim(),
                    token.trim(),
                    publicUrl.trim(),
                );

                setBots((current) => [bot, ...(current ?? [])]);
                setPage((current) => current && { ...current, total: current.total + 1 });
                setName('');
                setToken('');
                setPublicUrl('');
                setCreating(false);
            } catch (cause) {
                setFormError(apiError(cause, 'bots.errors.addFailed'));
            } finally {
                setBusy(false);
            }
        },
        [teamId, name, token, publicUrl],
    );

    const saveUrl = useCallback(
        async (bot: TeamBot) => {
            const next = (drafts[bot.id] ?? bot.public_url).trim();

            setError(null);
            setSaving(bot.id);

            try {
                const updated = await teamBotUpdate(teamId, { ...bot, public_url: next });

                setBots(
                    (current) =>
                        current?.map((item) => (item.id === bot.id ? updated : item)) ?? null,
                );
                setDrafts((current) => {
                    const { [bot.id]: _done, ...rest } = current;
                    return rest;
                });

                if (updated.public_url !== '') {
                    const registered = await teamBotWebhookRegister(teamId, bot.id);

                    setProbes((current) => ({
                        ...current,
                        [bot.id]: registered.ok
                            ? { ok: true, username: '' }
                            : {
                                  ok: false,
                                  reason: registered.reason ?? t('bots.errors.webhookRejected'),
                              },
                    }));
                }
            } catch (cause) {
                setError(apiError(cause, 'bots.errors.addressFailed'));
            } finally {
                setSaving(null);
            }
        },
        [teamId, drafts],
    );

    const test = useCallback(
        async (botId: number) => {
            setProbes((current) => ({ ...current, [botId]: 'testing' }));

            try {
                const probe = await teamBotTest(teamId, botId);

                setProbes((current) => ({ ...current, [botId]: probe }));
            } catch (cause) {
                setProbes((current) => ({
                    ...current,
                    [botId]: {
                        ok: false,
                        reason: apiError(cause, 'bots.probe.noAnswer'),
                    },
                }));
            }
        },
        [teamId],
    );

    const change = useCallback(
        async (bot: TeamBot, patch: Partial<TeamBot>, token?: string) => {
            setError(null);
            setSaving(bot.id);

            try {
                const updated = await teamBotUpdate(teamId, { ...bot, ...patch }, token);

                setBots(
                    (current) =>
                        current?.map((item) => (item.id === bot.id ? updated : item)) ?? null,
                );
                setTokens((current) => {
                    const { [bot.id]: _saved, ...rest } = current;
                    return rest;
                });

                if (patch.groups === true) {
                    void test(bot.id);
                }
            } catch (cause) {
                setError(apiError(cause, 'bots.errors.updateFailed'));
            } finally {
                setSaving(null);
            }
        },
        [teamId, test],
    );

    const remove = useCallback(
        async (botId: number) => {
            setError(null);

            try {
                await teamBotRemove(teamId, botId);

                setBots((current) => current?.filter((bot) => bot.id !== botId) ?? null);
                setPage(
                    (current) => current && { ...current, total: Math.max(0, current.total - 1) },
                );
                setProbes((current) => {
                    const { [botId]: _removed, ...rest } = current;
                    return rest;
                });
            } catch (cause) {
                setError(apiError(cause, 'bots.errors.removeFailed'));
            }
        },
        [teamId],
    );

    const goTo = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await teamBotList(teamId, { offset });

                setBots(next.bots);
                setPage(next);
            } catch (cause) {
                setError(apiError(cause, 'bots.errors.loadFailed'));
            } finally {
                setPaging(false);
            }
        },
        [teamId],
    );

    const createButton = (
        <Button
            onClick={() => {
                setFormError(null);
                setCreating(true);
            }}
            icon={<Plus />}
            message={t('bots.create.action')}
        />
    );

    return (
        <Stack direction="Vertical" as="section" className="gap-4">
            <Stack direction="Horizontal" className="flex-wrap items-center justify-between gap-3">
                <Text
                    type="BodyMuted"
                    message={
                        bots === null
                            ? t('bots.loading')
                            : tn('bots.connectedCount', page?.total ?? bots.length)
                    }
                />

                {createButton}
            </Stack>

            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent>
                    <Stack direction="Vertical" as="form" className="gap-5" onSubmit={add}>
                        <DialogHeader>
                            <DialogTitle>{t('bots.create.title')}</DialogTitle>
                            <DialogDescription>{t('bots.create.description')}</DialogDescription>
                        </DialogHeader>

                        <Field label={t('bots.create.name')} hint={t('bots.create.nameHint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    minLength={2}
                                    maxLength={64}
                                    required
                                    placeholder={t('bots.create.namePlaceholder')}
                                />
                            )}
                        </Field>

                        <Field label={t('bots.create.token')} hint={t('bots.create.tokenHint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="password"
                                    autoComplete="off"
                                    spellCheck={false}
                                    value={token}
                                    onChange={(event) => setToken(event.target.value)}
                                    maxLength={128}
                                    required
                                    placeholder="123456789:AA…"
                                />
                            )}
                        </Field>

                        <Field
                            label={t('bots.create.publicUrl')}
                            hint={t('bots.create.publicUrlHint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="url"
                                    value={publicUrl}
                                    onChange={(event) => setPublicUrl(event.target.value)}
                                    maxLength={256}
                                    className="font-mono"
                                    placeholder="https://bots.example.com"
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
                                variant="outline"
                                onClick={() => setCreating(false)}
                                message={t('bots.create.cancel')}
                            />
                            <Button
                                type="submit"
                                disabled={busy}
                                message={
                                    busy ? t('bots.create.submitting') : t('bots.create.submit')
                                }
                            />
                        </DialogFooter>
                    </Stack>
                </DialogContent>
            </Dialog>

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {bots === null && (
                <Stack direction="Vertical" className="gap-3 lg:grid-cols-2 lg:grid">
                    {[0, 1].map((i) => (
                        <Skeleton radius="xl" className="h-64" key={i} />
                    ))}
                </Stack>
            )}

            {bots !== null && bots.length === 0 && (
                <EmptyState
                    icon={MessageSquare}
                    title={t('bots.empty.title')}
                    description={t('bots.empty.description')}
                    action={createButton}
                />
            )}

            {bots !== null && bots.length > 0 && (
                <Stack
                    direction="Vertical"
                    as="ul"
                    className="m-0 list-none gap-3 p-0 lg:grid-cols-2 lg:grid">
                    {bots.map((bot) => {
                        const probe = probes[bot.id];
                        const url = drafts[bot.id] ?? bot.public_url;
                        const dirty = url.trim() !== bot.public_url;

                        return (
                            <Stack direction="Vertical" as="li" key={bot.id}>
                                <Card gap={3} className="h-full">
                                    <CardHeader>
                                        <CardTitle className="flex min-w-0 items-center gap-2">
                                            <StatusDot
                                                status={dotState(probe)}
                                                label={t('bots.card.status', { name: bot.name })}
                                            />
                                            <Text
                                                type="Foreground"
                                                as="span"
                                                className="truncate"
                                                message={bot.name}
                                            />
                                        </CardTitle>

                                        <Stack
                                            direction="Vertical"
                                            className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                                            <Badge
                                                variant={
                                                    bot.mode === 'webhook' ? 'secondary' : 'outline'
                                                }>
                                                {bot.mode === 'webhook'
                                                    ? t('bots.card.webhook')
                                                    : t('bots.card.polling')}
                                            </Badge>
                                        </Stack>
                                    </CardHeader>

                                    <CardContent className="grid gap-4">
                                        <DataList dense>
                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={t('bots.card.token')}
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={
                                                    bot.token_hint === ''
                                                        ? t('bots.card.tokenUnset')
                                                        : bot.token_hint
                                                }
                                            />
                                        </DataList>

                                        {bot.token_hint === '' && (
                                            <Stack direction="Vertical" className="gap-2">
                                                <Text
                                                    type="BodyMuted"
                                                    as="label"
                                                    htmlFor={`bot-token-${bot.id}`}
                                                    message={t('bots.card.tokenMissing')}
                                                />

                                                <Stack direction="Horizontal" className="gap-2">
                                                    <Input
                                                        id={`bot-token-${bot.id}`}
                                                        type="password"
                                                        autoComplete="off"
                                                        value={tokens[bot.id] ?? ''}
                                                        className="font-mono"
                                                        placeholder="123456789:AA..."
                                                        onChange={(event) =>
                                                            setTokens((current) => ({
                                                                ...current,
                                                                [bot.id]: event.target.value,
                                                            }))
                                                        }
                                                    />

                                                    <Button
                                                        variant="outline"
                                                        disabled={
                                                            (tokens[bot.id] ?? '').trim() === '' ||
                                                            saving === bot.id
                                                        }
                                                        onClick={() =>
                                                            void change(
                                                                bot,
                                                                {},
                                                                (tokens[bot.id] ?? '').trim(),
                                                            )
                                                        }
                                                        message={t('bots.card.saveToken')}
                                                    />
                                                </Stack>
                                            </Stack>
                                        )}

                                        <Stack direction="Vertical" className="gap-2">
                                            <Text
                                                type="BodyMuted"
                                                as="label"
                                                htmlFor={`bot-agent-${bot.id}`}
                                                message={t('bots.card.agent')}
                                            />

                                            <Select
                                                value={String(bot.agent_id)}
                                                disabled={saving === bot.id}
                                                onValueChange={(value) =>
                                                    void change(bot, { agent_id: Number(value) })
                                                }
                                                id={`bot-agent-${bot.id}`}
                                                placeholder={t('bots.card.agentPlaceholder')}>
                                                <SelectItem value="0">
                                                    {t('bots.card.agentNone')}
                                                </SelectItem>
                                                {agents.map((agent) => (
                                                    <SelectItem
                                                        key={agent.id}
                                                        value={String(agent.id)}>
                                                        {agent.name}
                                                    </SelectItem>
                                                ))}
                                            </Select>
                                        </Stack>

                                        <Stack
                                            direction="Horizontal"
                                            className="items-center gap-2">
                                            <Switch
                                                id={`bot-groups-${bot.id}`}
                                                checked={bot.groups}
                                                disabled={saving === bot.id}
                                                onCheckedChange={(checked) =>
                                                    void change(bot, { groups: checked })
                                                }
                                            />
                                            <Text
                                                type="Body"
                                                as="label"
                                                htmlFor={`bot-groups-${bot.id}`}
                                                message={t('bots.card.groups')}
                                            />
                                        </Stack>

                                        <Stack direction="Vertical" className="gap-2">
                                            <Text
                                                type="BodyMuted"
                                                as="label"
                                                htmlFor={`bot-people-${bot.id}`}
                                                message={
                                                    bot.profiles.length === 0
                                                        ? t('bots.card.peopleAll')
                                                        : t('bots.card.peopleSome')
                                                }
                                            />

                                            {bot.profiles.length > 0 && (
                                                <Stack
                                                    direction="Horizontal"
                                                    className="flex-wrap gap-1.5">
                                                    {bot.profiles.map((profile) => (
                                                        <Button
                                                            key={profile.id}
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={saving === bot.id}
                                                            icon={<X />}
                                                            onClick={() =>
                                                                void change(bot, {
                                                                    profiles: bot.profiles.filter(
                                                                        (item) =>
                                                                            item.id !== profile.id,
                                                                    ),
                                                                })
                                                            }
                                                            message={profile.name}
                                                        />
                                                    ))}
                                                </Stack>
                                            )}

                                            <ProfilePicker
                                                id={`bot-people-${bot.id}`}
                                                teamId={teamId}
                                                onPick={(picked) => {
                                                    if (
                                                        !bot.profiles.some(
                                                            (item) => item.id === picked.id,
                                                        )
                                                    ) {
                                                        void change(bot, {
                                                            profiles: [
                                                                ...bot.profiles,
                                                                {
                                                                    id: picked.id,
                                                                    name: profileName(picked),
                                                                },
                                                            ],
                                                        });
                                                    }
                                                }}
                                            />
                                        </Stack>

                                        <Stack direction="Vertical" className="gap-2">
                                            <Text
                                                type="BodyMuted"
                                                as="label"
                                                htmlFor={`bot-url-${bot.id}`}
                                                message={t('bots.card.publicUrl')}
                                            />

                                            <Stack direction="Horizontal" className="gap-2">
                                                <Input
                                                    id={`bot-url-${bot.id}`}
                                                    type="url"
                                                    value={url}
                                                    className="font-mono"
                                                    placeholder="https://bots.example.com"
                                                    onChange={(event) =>
                                                        setDrafts((current) => ({
                                                            ...current,
                                                            [bot.id]: event.target.value,
                                                        }))
                                                    }
                                                />

                                                <Button
                                                    variant="outline"
                                                    disabled={!dirty || saving === bot.id}
                                                    onClick={() => void saveUrl(bot)}
                                                    message={
                                                        saving === bot.id
                                                            ? t('bots.card.saving')
                                                            : t('bots.card.save')
                                                    }
                                                />
                                            </Stack>
                                        </Stack>

                                        {probe !== undefined && (
                                            <Text
                                                type="Body"
                                                as="output"
                                                className={PROBE_TONE[probeState(probe)]}
                                                message={probeLabel(probe, bot.groups)}
                                            />
                                        )}
                                    </CardContent>

                                    <CardFooter className="gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={probe === 'testing'}
                                            onClick={() => void test(bot.id)}
                                            message={
                                                probe === 'testing'
                                                    ? t('bots.card.testing')
                                                    : t('bots.card.test')
                                            }
                                        />

                                        <Stack direction="Horizontal" as="span" className="grow" />

                                        <ConfirmButton
                                            label={t('bots.remove.label')}
                                            title={t('bots.remove.title', { name: bot.name })}
                                            description={t('bots.remove.description')}
                                            confirmLabel={t('bots.remove.confirm')}
                                            onConfirm={() => void remove(bot.id)}
                                        />
                                    </CardFooter>
                                </Card>
                            </Stack>
                        );
                    })}
                </Stack>
            )}

            {page !== null && bots !== null && bots.length > 0 && (
                <Pager
                    framed
                    page={page}
                    shown={bots.length}
                    busy={paging}
                    noun={t('bots.pager.noun')}
                    onPage={(offset) => void goTo(offset)}
                />
            )}
        </Stack>
    );
}
