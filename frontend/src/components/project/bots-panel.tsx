import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { cn } from 'cn';

import {
    ApiError,
    agentList,
    teamBotCreate,
    teamBotList,
    teamBotRemove,
    teamBotTest,
    teamBotUpdate,
    teamBotWebhookRegister,
    type Paged,
    type TeamAgent,
    type TeamBot,
    type TeamBotProbe
} from '@/api';
import { PROBE_TONE } from '@/lib/constant';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot, type Status } from '@/components/ui/status-dot';

function probeState(probe: TeamBotProbe | 'testing'): string
{
    if (probe === 'testing')
    {
        return 'pending';
    }

    return probe.ok ? 'ok' : 'error';
}

function probeLabel(probe: TeamBotProbe | 'testing'): string
{
    if (probe === 'testing')
    {
        return 'Asking Telegram…';
    }

    if (!probe.ok)
    {
        return probe.reason ?? 'Telegram refused the token.';
    }

    return probe.username !== undefined && probe.username !== '' ? `Connected as @${ probe.username }` : 'Connected';
}

function dotState(probe: TeamBotProbe | 'testing' | undefined): Status
{
    if (probe === 'testing')
    {
        return 'degraded';
    }

    if (probe === undefined)
    {
        return 'off';
    }

    return probe.ok ? 'live' : 'failed';
}

export function BotsPanel({ teamId }: { teamId: number })
{
    const [ bots, setBots ] = useState<TeamBot[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ agents, setAgents ] = useState<TeamAgent[]>([ ]);

    const [ creating, setCreating ] = useState(false);
    const [ name, setName ] = useState('');
    const [ token, setToken ] = useState('');
    const [ publicUrl, setPublicUrl ] = useState('');

    const [ drafts, setDrafts ] = useState<Record<number, string>>({ });
    const [ saving, setSaving ] = useState<number | null>(null);
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ formError, setFormError ] = useState<string | null>(null);
    const [ probes, setProbes ] = useState<Record<number, TeamBotProbe | 'testing'>>({ });

    useEffect(() =>
    {
        let active = true;

        Promise.all([ teamBotList(teamId), agentList(teamId) ])
            .then(([ botPayload, agentPayload ]) =>
            {
                if (active)
                {
                    setBots(botPayload.bots);
                    setPage(botPayload);
                    setAgents(agentPayload.agents);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setBots([ ]);
                    setError(cause instanceof ApiError ? cause.result : 'The bots could not be loaded.');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    const add = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setFormError(null);
        setBusy(true);

        try
        {
            const bot = await teamBotCreate(teamId, name.trim(), token.trim(), publicUrl.trim());

            setBots((current) => [ bot, ...current ?? [ ] ]);
            setPage((current) => current && { ...current, total: current.total + 1 });
            setName('');
            setToken('');
            setPublicUrl('');
            setCreating(false);
        }
        catch (cause)
        {
            setFormError(cause instanceof ApiError ? cause.result : 'The bot could not be added.');
        }
        finally
        {
            setBusy(false);
        }
    }, [ teamId, name, token, publicUrl ]);

    const saveUrl = useCallback(async(bot: TeamBot) =>
    {
        const next = (drafts[bot.id] ?? bot.public_url).trim();

        setError(null);
        setSaving(bot.id);

        try
        {
            const updated = await teamBotUpdate(teamId, bot.id, bot.name, next, bot.agent_id);

            setBots((current) => current?.map((item) => item.id === bot.id ? updated : item) ?? null);
            setDrafts((current) => { const { [bot.id]: _done, ...rest } = current; return rest; });

            if (updated.public_url !== '')
            {
                const registered = await teamBotWebhookRegister(teamId, bot.id);

                setProbes((current) => ({ ...current, [bot.id]: registered.ok
                    ? { ok: true, username: '' }
                    : { ok: false, reason: registered.reason ?? 'Telegram would not accept the address.' } }));
            }
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The address could not be saved.');
        }
        finally
        {
            setSaving(null);
        }
    }, [ teamId, drafts ]);

    const test = useCallback(async(botId: number) =>
    {
        setProbes((current) => ({ ...current, [botId]: 'testing' }));

        try
        {
            const probe = await teamBotTest(teamId, botId);

            setProbes((current) => ({ ...current, [botId]: probe }));
        }
        catch (cause)
        {
            setProbes((current) => ({ ...current, [botId]: { ok: false, reason: cause instanceof ApiError ? cause.result : 'No answer from Telegram.' } }));
        }
    }, [ teamId ]);

    const setAgent = useCallback(async(bot: TeamBot, agentId: number) =>
    {
        setError(null);
        setSaving(bot.id);

        try
        {
            const updated = await teamBotUpdate(teamId, bot.id, bot.name, bot.public_url, agentId);

            setBots((current) => current?.map((item) => item.id === bot.id ? updated : item) ?? null);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The agent could not be attached.');
        }
        finally
        {
            setSaving(null);
        }
    }, [ teamId ]);

    const remove = useCallback(async(botId: number) =>
    {
        setError(null);

        try
        {
            await teamBotRemove(teamId, botId);

            setBots((current) => current?.filter((bot) => bot.id !== botId) ?? null);
            setPage((current) => current && { ...current, total: Math.max(0, current.total - 1) });
            setProbes((current) => { const { [botId]: _removed, ...rest } = current; return rest; });
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The bot could not be removed.');
        }
    }, [ teamId ]);

    const goTo = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await teamBotList(teamId, { offset });

            setBots(next.bots);
            setPage(next);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The bots could not be loaded.');
        }
        finally
        {
            setPaging(false);
        }
    }, [ teamId ]);

    const createButton = (
        <Button onClick={ () => { setFormError(null); setCreating(true); } }>
            <Plus aria-hidden="true" />
            Connect a bot
        </Button>
    );

    return (
        <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-sm text-muted-foreground">
                    { bots === null ? 'Loading bots.' : `${ page?.total.toLocaleString() ?? bots.length } bot${ (page?.total ?? bots.length) === 1 ? '' : 's' } connected to Telegram.` }
                </p>

                { createButton }
            </div>

            <Dialog open={ creating } onOpenChange={ setCreating }>
                <DialogContent>
                    <form className="grid gap-5" onSubmit={ add }>
                        <DialogHeader>
                            <DialogTitle>Connect a bot</DialogTitle>
                            <DialogDescription>Create the bot with BotFather on Telegram first, then paste its token here.</DialogDescription>
                        </DialogHeader>

                        <Field label="Name" hint="Only you see this. It labels the bot inside Nura.">
                            { (id) => (
                                <Input
                                    id={ id }
                                    value={ name }
                                    onChange={ (event) => setName(event.target.value) }
                                    minLength={ 2 }
                                    maxLength={ 64 }
                                    required
                                    placeholder="Support bot"
                                />
                            ) }
                        </Field>

                        <Field label="BotFather token" hint="Stored write-only. Nura shows you the last four characters and nothing more.">
                            { (id) => (
                                <Input
                                    id={ id }
                                    type="password"
                                    autoComplete="off"
                                    spellCheck={ false }
                                    value={ token }
                                    onChange={ (event) => setToken(event.target.value) }
                                    maxLength={ 128 }
                                    required
                                    placeholder="123456789:AA…"
                                />
                            ) }
                        </Field>

                        <Field label="Public address" hint="Leave blank and Nura will poll Telegram instead of receiving webhooks.">
                            { (id) => (
                                <Input
                                    id={ id }
                                    type="url"
                                    value={ publicUrl }
                                    onChange={ (event) => setPublicUrl(event.target.value) }
                                    maxLength={ 256 }
                                    className="font-mono"
                                    placeholder="https://bots.example.com"
                                />
                            ) }
                        </Field>

                        { formError !== null && <Alert variant="destructive"><AlertDescription>{ formError }</AlertDescription></Alert> }

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={ () => setCreating(false) }>Cancel</Button>
                            <Button type="submit" disabled={ busy }>{ busy ? 'Connecting…' : 'Connect bot' }</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            { error !== null && <Alert variant="destructive"><AlertDescription>{ error }</AlertDescription></Alert> }

            { bots === null && (
                <div className="grid gap-3 lg:grid-cols-2">
                    { [ 0, 1 ].map((i) => <Skeleton className="h-64 rounded-xl" key={ i } />) }
                </div>
            ) }

            { bots !== null && bots.length === 0 && (
                <EmptyState
                    icon={ MessageSquare }
                    title="No bots connected"
                    description="A bot is how people reach your agents. Create one with BotFather, then paste its token here."
                    action={ createButton }
                />
            ) }

            { bots !== null && bots.length > 0 && (
                <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
                    { bots.map((bot) =>
                    {
                        const probe = probes[bot.id];
                        const url = drafts[bot.id] ?? bot.public_url;
                        const dirty = url.trim() !== bot.public_url;

                        return (
                            <li key={ bot.id }>
                                <Card className="h-full gap-3">
                                    <CardHeader>
                                        <CardTitle className="flex min-w-0 items-center gap-2">
                                            <StatusDot status={ dotState(probe) } label={ `Bot ${ bot.name }` } />
                                            <span className="truncate">{ bot.name }</span>
                                        </CardTitle>

                                        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                                            <Badge variant={ bot.mode === 'webhook' ? 'secondary' : 'outline' }>
                                                { bot.mode === 'webhook' ? 'Webhook' : 'Polling' }
                                            </Badge>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="grid gap-4">
                                        <dl className="m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-sm">
                                            <dt className="text-muted-foreground">Token</dt>
                                            <dd className="m-0 truncate font-mono text-2xs">{ bot.token_hint }</dd>
                                        </dl>

                                        <div className="grid gap-2">
                                            <label className="text-sm text-muted-foreground" htmlFor={ `bot-agent-${ bot.id }` }>Answered by</label>

                                            <Select
                                                value={ String(bot.agent_id) }
                                                disabled={ saving === bot.id }
                                                onValueChange={ (value) => void setAgent(bot, Number(value)) }
                                            >
                                                <SelectTrigger id={ `bot-agent-${ bot.id }` } className="w-full">
                                                    <SelectValue placeholder="Nobody yet" />
                                                </SelectTrigger>

                                                <SelectContent>
                                                    <SelectItem value="0">Nobody</SelectItem>
                                                    { agents.map((agent) => (
                                                        <SelectItem key={ agent.id } value={ String(agent.id) }>{ agent.name }</SelectItem>
                                                    )) }
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid gap-2">
                                            <label className="text-sm text-muted-foreground" htmlFor={ `bot-url-${ bot.id }` }>Public address</label>

                                            <div className="flex gap-2">
                                                <Input
                                                    id={ `bot-url-${ bot.id }` }
                                                    type="url"
                                                    value={ url }
                                                    className="font-mono"
                                                    placeholder="https://bots.example.com"
                                                    onChange={ (event) => setDrafts((current) => ({ ...current, [bot.id]: event.target.value })) }
                                                />

                                                <Button
                                                    variant="outline"
                                                    disabled={ !dirty || saving === bot.id }
                                                    onClick={ () => void saveUrl(bot) }
                                                >
                                                    { saving === bot.id ? 'Saving…' : 'Save' }
                                                </Button>
                                            </div>
                                        </div>

                                        { probe !== undefined && (
                                            <output className={ cn('m-0 text-sm', PROBE_TONE[probeState(probe)]) }>{ probeLabel(probe) }</output>
                                        ) }
                                    </CardContent>

                                    <CardFooter className="gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={ probe === 'testing' }
                                            onClick={ () => void test(bot.id) }
                                        >
                                            { probe === 'testing' ? 'Testing…' : 'Test token' }
                                        </Button>

                                        <span className="grow" />

                                        <ConfirmButton
                                            label="Remove"
                                            confirmLabel="Remove for good"
                                            onConfirm={ () => void remove(bot.id) }
                                        />
                                    </CardFooter>
                                </Card>
                            </li>
                        );
                    }) }
                </ul>
            ) }

            { page !== null && bots !== null && bots.length > 0 && (
                <PaginationFooter page={ page } shown={ bots.length } busy={ paging } noun="bots" onPage={ (offset) => void goTo(offset) } />
            ) }
        </section>
    );
}
