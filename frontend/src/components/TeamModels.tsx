import { useCallback, useEffect, useState } from 'react';
import { Cpu, Plus } from 'lucide-react';

import { Button } from './Button';
import { ApiError, modelCatalog, modelCreate, modelList, modelRemove, modelTest, type CatalogModel, type TeamModel, type TeamModelProbe } from '../lib/api';

/**
 * OpenRouter is the default because it needs one key and no url, which is the
 * shortest path from a new team to a working agent. Anything else compatible
 * still works -- it just has to be typed out.
 */
type Provider = 'openrouter' | 'custom';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

interface TeamModelsProps
{
    teamId: number;
}

/** Shown beside a catalog entry, since price is most of why one is picked over another. */
function priceLabel(entry: CatalogModel): string
{
    if (entry.prompt === 0 && entry.completion === 0)
    {
        return ' · free';
    }

    return ` · $${ entry.prompt }/$${ entry.completion } per 1M`;
}

function probeState(probe: TeamModelProbe | 'testing'): string
{
    if (probe === 'testing')
    {
        return 'pending';
    }

    return probe.ok ? 'ok' : 'error';
}

function probeLabel(probe: TeamModelProbe | 'testing'): string
{
    if (probe === 'testing')
    {
        return 'Checking endpoint...';
    }

    if (!probe.ok)
    {
        return probe.reason ?? 'REQUEST_FAILED';
    }

    // Reachable and authorised, but the configured name was not in the listing.
    // Worth saying: some compatible servers list only a subset.
    const found = probe.found === true ? 'model available' : 'model not in listing';

    return `Connected · ${ probe.models ?? 0 } models · ${ found }`;
}

/** The OpenAI-compatible model endpoints registered against one team. */
export function TeamModels({ teamId }: TeamModelsProps)
{
    const [ models, setModels ] = useState<TeamModel[] | null>(null);
    const [ provider, setProvider ] = useState<Provider>('openrouter');
    const [ catalog, setCatalog ] = useState<CatalogModel[]>([ ]);
    const [ catalogUrl, setCatalogUrl ] = useState(OPENROUTER_URL);
    const [ name, setName ] = useState('');
    const [ model, setModel ] = useState('');
    const [ baseUrl, setBaseUrl ] = useState('');
    const [ apiKey, setApiKey ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    // Removing a model cannot be undone -- the key is never sent back, so it
    // cannot be re-entered from anything on screen -- so it takes two clicks.
    const [ arming, setArming ] = useState<number | null>(null);
    const [ probes, setProbes ] = useState<Record<number, TeamModelProbe | 'testing'>>({ });

    useEffect(() =>
    {
        let active = true;

        modelList(teamId)
            .then((payload) =>
            {
                if (active)
                {
                    setModels(payload.models);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setModels([ ]);
                    setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    // Separate from the model list: a provider outage should leave the team's
    // own models on screen, so a failure here only empties the suggestions.
    useEffect(() =>
    {
        let active = true;

        modelCatalog()
            .then((payload) =>
            {
                if (active)
                {
                    setCatalog(payload.models);
                    setCatalogUrl(payload.base_url);
                }
            })
            .catch(() => { });

        return () =>
        {
            active = false;
        };
    }, [ ]);

    const add = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setBusy(true);

        try
        {
            // The provider url is the server's, not a constant duplicated here.
            const url = provider === 'openrouter' ? catalogUrl : baseUrl.trim();

            const created = await modelCreate(teamId, name.trim(), model.trim(), url, apiKey.trim());

            setModels((current) => [ created, ...current ?? [ ] ]);
            setName('');
            setModel('');
            setBaseUrl('');
            setApiKey('');
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setBusy(false);
        }
    }, [ teamId, provider, catalogUrl, name, model, baseUrl, apiKey ]);

    const test = useCallback(async(modelId: number) =>
    {
        setProbes((current) => ({ ...current, [modelId]: 'testing' }));

        try
        {
            const probe = await modelTest(teamId, modelId);

            setProbes((current) => ({ ...current, [modelId]: probe }));
        }
        catch (cause)
        {
            setProbes((current) => ({ ...current, [modelId]: { ok: false, reason: cause instanceof ApiError ? cause.result : 'REQUEST_FAILED' } }));
        }
    }, [ teamId ]);

    const remove = useCallback(async(modelId: number) =>
    {
        if (arming !== modelId)
        {
            setArming(modelId);

            return;
        }

        setError(null);
        setArming(null);

        try
        {
            await modelRemove(teamId, modelId);

            setModels((current) => current?.filter((item) => item.id !== modelId) ?? null);
            setProbes((current) => { const { [modelId]: _done, ...rest } = current; return rest; });
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
    }, [ teamId, arming ]);

    return (
        <section className="section">
            <h2 className="section__title">Model</h2>

            <form className="form" onSubmit={ add }>
                <label className="field">
                    <span className="field__label">Provider</span>

                    <select
                        className="field__input"
                        value={ provider }
                        onChange={ (event) => setProvider(event.target.value as Provider) }
                    >
                        <option value="openrouter">OpenRouter · one key, every model</option>
                        <option value="custom">Other OpenAI-compatible endpoint</option>
                    </select>
                </label>

                <label className="field">
                    <span className="field__label">Label</span>

                    <input
                        className="field__input"
                        value={ name }
                        onChange={ (event) => setName(event.target.value) }
                        minLength={ 2 }
                        maxLength={ 64 }
                        required
                        placeholder="Primary"
                    />
                </label>

                <label className="field">
                    <span className="field__label">Model name</span>

                    <input
                        className="field__input"
                        value={ model }
                        onChange={ (event) => setModel(event.target.value) }
                        maxLength={ 128 }
                        required
                        // A datalist rather than a select: the list is long, the
                        // browser filters it as you type for free, and a model
                        // released since the catalog was cached can still be typed.
                        list={ provider === 'openrouter' ? 'openrouter-models' : undefined }
                        placeholder={ provider === 'openrouter' ? 'anthropic/claude-sonnet-4.5' : 'gpt-4o-mini' }
                    />
                </label>

                { provider === 'openrouter' && (
                    <datalist id="openrouter-models">
                        { catalog.map((entry) => (
                            <option key={ entry.id } value={ entry.id }>{ entry.name }{ priceLabel(entry) }</option>
                        )) }
                    </datalist>
                ) }

                { provider === 'custom' && (
                    <label className="field">
                        <span className="field__label">Compatible URL</span>

                        <input
                            className="field__input"
                            type="url"
                            value={ baseUrl }
                            onChange={ (event) => setBaseUrl(event.target.value) }
                            maxLength={ 256 }
                            required
                            placeholder="https://api.openai.com/v1"
                        />
                    </label>
                ) }

                <label className="field">
                    <span className="field__label">{ provider === 'openrouter' ? 'API key' : 'API key (blank for none)' }</span>

                    <input
                        className="field__input"
                        // A credential, and write-only once stored.
                        type="password"
                        autoComplete="off"
                        spellCheck={ false }
                        value={ apiKey }
                        onChange={ (event) => setApiKey(event.target.value) }
                        maxLength={ 256 }
                        required={ provider === 'openrouter' }
                        placeholder={ provider === 'openrouter' ? 'sk-or-v1-...' : 'sk-...  (local models usually need none)' }
                    />
                </label>

                <Button type="submit" disabled={ busy } icon={ <Plus size={ 18 } aria-hidden="true" /> }>
                    { busy ? 'Adding...' : 'Add model' }
                </Button>
            </form>

            { error !== null && <p className="status" data-state="error" role="alert">{ error }</p> }

            { models === null && <p className="status">Loading models...</p> }

            { models !== null && models.length === 0 && (
                <p className="status">
                    <Cpu size={ 18 } aria-hidden="true" /> No models yet. Add one above.
                </p>
            ) }

            { models !== null && models.length > 0 && (
                <ul className="list">
                    { models.map((item) => (
                        <li className="list__item list__item--row" key={ item.id }>
                            <span className="list__text">
                                <span className="list__name">{ item.name }</span>

                                <span className="list__meta">{ item.model } · { item.base_url } · key { item.key_hint }</span>

                                { probes[item.id] !== undefined && (
                                    <span className="probe" data-state={ probeState(probes[item.id]) }>
                                        { probeLabel(probes[item.id]) }
                                    </span>
                                ) }
                            </span>

                            <span className="list__actions">
                                <button
                                    className="ghost"
                                    type="button"
                                    disabled={ probes[item.id] === 'testing' }
                                    onClick={ () => void test(item.id) }
                                >
                                    { probes[item.id] === 'testing' ? 'Checking...' : 'Test Connectivity' }
                                </button>

                                <button
                                    className="ghost ghost--danger"
                                    type="button"
                                    data-state={ arming === item.id ? 'armed' : undefined }
                                    onClick={ () => void remove(item.id) }
                                >
                                    { arming === item.id ? 'Confirm' : 'Remove' }
                                </button>
                            </span>
                        </li>
                    )) }
                </ul>
            ) }
        </section>
    );
}
