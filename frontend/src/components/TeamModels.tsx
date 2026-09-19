import { useCallback, useEffect, useState } from 'react';
import { Cpu, Plus } from 'lucide-react';

import { Button } from './Button';
import { ApiError, modelCreate, modelList, modelRemove, modelTest, type TeamModel, type TeamModelProbe } from '../lib/api';

interface TeamModelsProps
{
    teamId: number;
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

    const add = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setBusy(true);

        try
        {
            const created = await modelCreate(teamId, name.trim(), model.trim(), baseUrl.trim(), apiKey.trim());

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
    }, [ teamId, name, model, baseUrl, apiKey ]);

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
                        placeholder="gpt-4o-mini"
                    />
                </label>

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

                <label className="field">
                    <span className="field__label">API key</span>

                    <input
                        className="field__input"
                        // A credential, and write-only once stored.
                        type="password"
                        autoComplete="off"
                        spellCheck={ false }
                        value={ apiKey }
                        onChange={ (event) => setApiKey(event.target.value) }
                        maxLength={ 256 }
                        required
                        placeholder="sk-..."
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
