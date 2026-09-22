import { useCallback, useEffect, useState } from 'react';
import { Bot, Plus } from 'lucide-react';

import { Button } from './Button';
import { LED, type LedState } from './LED';
import { PaginationFooter } from './PaginationFooter';
import { Panel } from './Panel';
import { ApiError, agentList, teamBotCreate, teamBotList, teamBotRemove, teamBotTest, teamBotUpdate, teamBotWebhookRegister, type Paged, type TeamAgent, type TeamBot, type TeamBotProbe } from '../lib/api';

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

    // Telegram may answer without a username for some bots.
    return probe.username !== undefined && probe.username !== '' ? `Connected as @${ probe.username }` : 'Connected';
}

/**
 * Lit once a check has passed; brass while one is running. A bot nobody has
 * checked yet is unknown, and a failed check is words next to a grey dot, not
 * a red one -- the LED says whether it is running, the probe says why not.
 */
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

/** The Telegram bots registered against one team. */
export function TeamBots({ teamId }: TeamBotsProps)
{
    const [ bots, setBots ] = useState<TeamBot[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ name, setName ] = useState('');
    const [ token, setToken ] = useState('');
    const [ publicUrl, setPublicUrl ] = useState('');

    // Per-bot draft of the public url, so editing one row does not disturb
    // another. Absent from the map means "not being edited".
    const [ drafts, setDrafts ] = useState<Record<number, string>>({ });
    const [ saving, setSaving ] = useState<number | null>(null);

    // The agents available to answer for a bot.
    const [ agents, setAgents ] = useState<TeamAgent[]>([ ]);
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    // The id of the bot whose Remove button has been armed. Removing one cannot
    // be undone -- the token is never sent back, so it cannot be re-entered
    // from anything on screen -- so it takes a second, deliberate click.
    const [ arming, setArming ] = useState<number | null>(null);

    // Per-bot connection check: 'testing' while in flight, then the outcome.
    // Keyed by bot id so several rows can be checked without clobbering.
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

    /**
     * Saves the row's url, then points Telegram at it. A blank url is a
     * deliberate switch to polling, so there is nothing to register.
     */
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

    /** Binding an agent is its own save, so it takes effect on selection. */
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
            <form className="form mt-0" onSubmit={ add }>
                <label className="field">
                    <span className="field__label">Bot name</span>

                    <input
                        className="field__input"
                        value={ name }
                        onChange={ (event) => setName(event.target.value) }
                        minLength={ 2 }
                        maxLength={ 64 }
                        required
                        placeholder="Support bot"
                    />
                </label>

                <label className="field">
                    <span className="field__label">BotFather token</span>

                    <input
                        className="field__input"
                        // Masked and kept out of autofill: this is a credential,
                        // and it is write-only once stored.
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

                <label className="field">
                    <span className="field__label">Public URL (blank = polling)</span>

                    <input
                        className="field__input"
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

            { error !== null && <p className="note" data-state="error" role="alert">{ error }</p> }

            { bots === null && <p className="note">Loading bots...</p> }

            { bots !== null && bots.length === 0 && (
                <p className="note">
                    <Bot size={ 18 } aria-hidden="true" /> No bots yet. Add one above.
                </p>
            ) }

            { bots !== null && bots.length > 0 && (
                <ul className="rows">
                    { bots.map((bot) => (
                        <li className="rows__item rows__item--row" key={ bot.id }>
                            <span className="rows__text">
                                <span className="rows__name flex items-center gap-2.5">
                                    <LED state={ ledState(probes[bot.id]) } />
                                    { bot.name }
                                </span>

                                <span className="rows__meta">
                                    { bot.token_hint }
                                    { ' ' }
                                    <span className="badge" data-mode={ bot.mode }>{ bot.mode }</span>
                                    { bot.agent_name !== '' && <> { ' ' }<span className="badge" data-mode="agent">{ bot.agent_name }</span></> }
                                </span>

                                { probes[bot.id] !== undefined && (
                                    <span className="probe" data-state={ probeState(probes[bot.id]) }>
                                        { probeLabel(probes[bot.id]) }
                                    </span>
                                ) }
                            </span>

                            <span className="rows__actions">
                                <button
                                    className="ghost"
                                    type="button"
                                    disabled={ probes[bot.id] === 'testing' }
                                    onClick={ () => void test(bot.id) }
                                >
                                    { probes[bot.id] === 'testing' ? 'Checking...' : 'Network Connection' }
                                </button>

                                <button
                                    className="ghost ghost--danger"
                                    type="button"
                                    data-state={ arming === bot.id ? 'armed' : undefined }
                                    onClick={ () => void remove(bot.id) }
                                >
                                    { arming === bot.id ? 'Confirm' : 'Remove' }
                                </button>
                            </span>

                            <span className="rows__url">
                                <select
                                    className="field__input"
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

                            <span className="rows__url">
                                <input
                                    className="field__input"
                                    type="url"
                                    aria-label={ `Public URL for ${ bot.name }` }
                                    value={ drafts[bot.id] ?? bot.public_url }
                                    onChange={ (event) => setDrafts((current) => ({ ...current, [bot.id]: event.target.value })) }
                                    maxLength={ 256 }
                                    placeholder="https://bots.example.com  (blank = polling)"
                                />

                                <button
                                    className="ghost"
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
