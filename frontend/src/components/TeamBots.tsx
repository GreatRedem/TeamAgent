import { useCallback, useEffect, useState } from 'react';
import { Bot, Plus } from 'lucide-react';

import { Button } from './ui/Button';
import { LED, type LedState } from './ui/LED';
import { PaginationFooter } from './ui/PaginationFooter';
import { Panel } from './ui/Panel';
import { ApiError, agentList, teamBotCreate, teamBotList, teamBotRemove, teamBotTest, teamBotUpdate, teamBotWebhookRegister, type Paged, type TeamAgent, type TeamBot, type TeamBotProbe } from '../api';

import {
    CLASS_BADGE,
    CLASS_BADGE_MUTED,
    CLASS_FIELD,
    CLASS_FIELD_INPUT,
    CLASS_FIELD_LABEL,
    CLASS_FORM,
    CLASS_GHOST,
    CLASS_GHOST_ARMED,
    CLASS_GHOST_DANGER,
    CLASS_NOTE,
    CLASS_NOTE_ERROR,
    CLASS_PROBE,
    CLASS_ROW,
    CLASS_ROWS,
    CLASS_ROW_ACTIONS,
    CLASS_ROW_FORM,
    CLASS_ROW_META,
    CLASS_ROW_NAME,
    CLASS_ROW_TEXT
} from '../lib/constant';

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
        return 'Checking with Telegram...';
    }

    if (!probe.ok)
    {
        return probe.reason ?? 'REQUEST_FAILED';
    }

    return probe.username !== undefined && probe.username !== '' ? `Connected as @${ probe.username }` : 'Connected';
}

function ledState(probe: TeamBotProbe | 'testing' | undefined): LedState
{
    if (probe === 'testing')
    {
        return 'degraded';
    }

    return probe?.ok === true ? 'live' : 'off';
}

interface TeamBotsProps
{
    teamId: number;
}

export function TeamBots({ teamId }: TeamBotsProps)
{
    const [ bots, setBots ] = useState<TeamBot[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ name, setName ] = useState('');
    const [ token, setToken ] = useState('');
    const [ publicUrl, setPublicUrl ] = useState('');

    const [ drafts, setDrafts ] = useState<Record<number, string>>({ });
    const [ saving, setSaving ] = useState<number | null>(null);

    const [ agents, setAgents ] = useState<TeamAgent[]>([ ]);
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    const [ arming, setArming ] = useState<number | null>(null);

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
                    setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
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

        setError(null);
        setBusy(true);

        try
        {
            const bot = await teamBotCreate(teamId, name.trim(), token.trim(), publicUrl.trim());

            setBots((current) => [ bot, ...current ?? [ ] ]);
            setPage((current) => current && { ...current, total: current.total + 1 });
            setName('');
            setToken('');
            setPublicUrl('');
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
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
                    : { ok: false, reason: registered.reason ?? 'REQUEST_FAILED' } }));
            }
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
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
            setProbes((current) => ({ ...current, [botId]: { ok: false, reason: cause instanceof ApiError ? cause.result : 'REQUEST_FAILED' } }));
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
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setSaving(null);
        }
    }, [ teamId ]);

    const remove = useCallback(async(botId: number) =>
    {
        if (arming !== botId)
        {
            setArming(botId);

            return;
        }

        setError(null);
        setArming(null);

        try
        {
            await teamBotRemove(teamId, botId);

            setBots((current) => current?.filter((bot) => bot.id !== botId) ?? null);
            setPage((current) => current && { ...current, total: Math.max(0, current.total - 1) });
            setProbes((current) => { const { [botId]: _removed, ...rest } = current; return rest; });
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
    }, [ teamId, arming ]);

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
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setPaging(false);
        }
    }, [ teamId ]);

    return (
        <Panel
            title="Bots"
            sub="The Telegram bots this team runs, and which agent answers for each"
            footer={ page !== null && bots !== null && (
                <PaginationFooter page={ page } shown={ bots.length } busy={ paging } noun="bots" onPage={ (offset) => void goTo(offset) } />
            ) }
        >
            <form className={ CLASS_FORM } onSubmit={ add }>
                <label className={ CLASS_FIELD }>
                    <span className={ CLASS_FIELD_LABEL }>Bot name</span>

                    <input
                        className={ CLASS_FIELD_INPUT }
                        value={ name }
                        onChange={ (event) => setName(event.target.value) }
                        minLength={ 2 }
                        maxLength={ 64 }
                        required
                        placeholder="Support bot"
                    />
                </label>

                <label className={ CLASS_FIELD }>
                    <span className={ CLASS_FIELD_LABEL }>BotFather token</span>

                    <input
                        className={ CLASS_FIELD_INPUT }
                        type="password"
                        autoComplete="off"
                        spellCheck={ false }
                        value={ token }
                        onChange={ (event) => setToken(event.target.value) }
                        maxLength={ 128 }
                        required
                        placeholder="123456789:AA..."
                    />
                </label>

                <label className={ CLASS_FIELD }>
                    <span className={ CLASS_FIELD_LABEL }>Public URL (blank = polling)</span>

                    <input
                        className={ CLASS_FIELD_INPUT }
                        type="url"
                        value={ publicUrl }
                        onChange={ (event) => setPublicUrl(event.target.value) }
                        maxLength={ 256 }
                        placeholder="https://bots.example.com"
                    />
                </label>

                <Button type="submit" disabled={ busy } icon={ <Plus size={ 18 } aria-hidden="true" /> }>
                    { busy ? 'Adding...' : 'Add bot' }
                </Button>
            </form>

            { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

            { bots === null && <p className={ CLASS_NOTE }>Loading bots...</p> }

            { bots !== null && bots.length === 0 && (
                <p className={ CLASS_NOTE }>
                    <Bot size={ 18 } aria-hidden="true" /> No bots yet. Add one above.
                </p>
            ) }

            { bots !== null && bots.length > 0 && (
                <ul className={ CLASS_ROWS }>
                    { bots.map((bot) => (
                        <li className={ CLASS_ROW } key={ bot.id }>
                            <span className={ CLASS_ROW_TEXT }>
                                <span className={ `${ CLASS_ROW_NAME } flex items-center gap-2.5` }>
                                    <LED state={ ledState(probes[bot.id]) } />
                                    { bot.name }
                                </span>

                                <span className={ CLASS_ROW_META }>
                                    { bot.token_hint }
                                    { ' ' }
                                    <span className={ bot.mode === 'polling' ? CLASS_BADGE_MUTED : CLASS_BADGE }>{ bot.mode }</span>
                                    { bot.agent_name !== '' && <> { ' ' }<span className={ CLASS_BADGE }>{ bot.agent_name }</span></> }
                                </span>

                                { probes[bot.id] !== undefined && (
                                    <span className={ CLASS_PROBE[probeState(probes[bot.id])] }>
                                        { probeLabel(probes[bot.id]) }
                                    </span>
                                ) }
                            </span>

                            <span className={ CLASS_ROW_ACTIONS }>
                                <button
                                    className={ CLASS_GHOST }
                                    type="button"
                                    disabled={ probes[bot.id] === 'testing' }
                                    onClick={ () => void test(bot.id) }
                                >
                                    { probes[bot.id] === 'testing' ? 'Checking...' : 'Network Connection' }
                                </button>

                                <button
                                    className={ arming === bot.id ? CLASS_GHOST_ARMED : CLASS_GHOST_DANGER }
                                    type="button"
                                    onClick={ () => void remove(bot.id) }
                                >
                                    { arming === bot.id ? 'Confirm' : 'Remove' }
                                </button>
                            </span>

                            <span className={ CLASS_ROW_FORM }>
                                <select
                                    className={ CLASS_FIELD_INPUT }
                                    aria-label={ `Agent answering for ${ bot.name }` }
                                    value={ bot.agent_id }
                                    disabled={ saving === bot.id }
                                    onChange={ (event) => void setAgent(bot, Number(event.target.value)) }
                                >
                                    <option value="0">No agent — record only</option>

                                    { agents.map((agent) => (
                                        <option key={ agent.id } value={ agent.id }>{ agent.name }</option>
                                    )) }
                                </select>
                            </span>

                            <span className={ CLASS_ROW_FORM }>
                                <input
                                    className={ CLASS_FIELD_INPUT }
                                    type="url"
                                    aria-label={ `Public URL for ${ bot.name }` }
                                    value={ drafts[bot.id] ?? bot.public_url }
                                    onChange={ (event) => setDrafts((current) => ({ ...current, [bot.id]: event.target.value })) }
                                    maxLength={ 256 }
                                    placeholder="https://bots.example.com  (blank = polling)"
                                />

                                <button
                                    className={ CLASS_GHOST }
                                    type="button"
                                    disabled={ saving === bot.id }
                                    onClick={ () => void saveUrl(bot) }
                                >
                                    { saving === bot.id ? 'Saving...' : 'Save' }
                                </button>
                            </span>
                        </li>
                    )) }
                </ul>
            ) }
        </Panel>
    );
}
