import { useCallback, useEffect, useState } from 'react';
import { Cpu, Plus } from 'lucide-react';

import {
    ApiError,
    modelCatalog,
    modelCreate,
    modelList,
    modelProbe,
    modelRemove,
    modelTest,
    modelUpdate,
    type CatalogModel,
    type Paged,
    type ProviderPreset,
    type TeamModel,
    type TeamModelProbe
} from '../api';
import {
    CLASS_BADGE_MUTED,
    CLASS_CARD,
    CLASS_CARD_ACTIONS,
    CLASS_CARD_GRID,
    CLASS_CARD_META,
    CLASS_CARD_NAME,
    CLASS_FIELD,
    CLASS_FIELD_HINT,
    CLASS_FIELD_INPUT,
    CLASS_FIELD_LABEL,
    CLASS_FORM,
    CLASS_FORM_ACTIONS,
    CLASS_GHOST,
    CLASS_GHOST_ARMED,
    CLASS_GHOST_DANGER,
    CLASS_NOTE,
    CLASS_NOTE_ERROR,
    CLASS_PROBE,
    PROVIDER_FALLBACK
} from '../lib/constant';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { PaginationFooter } from './ui/PaginationFooter';
import { Panel } from './ui/Panel';

interface ModelDraft
{
    id: number;
    name: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    contextTokens: string;
}

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

    const found = probe.found === true ? 'model available' : 'model not in listing';

    const context = (probe.context ?? 0) > 0 ? ` · ${ probe.context?.toLocaleString() } token window` : '';

    return `Connected · ${ probe.models ?? 0 } models · ${ found }${ context }`;
}

export function TeamModels({ teamId }: { teamId: number })
{
    const [ models, setModels ] = useState<TeamModel[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ provider, setProvider ] = useState('');
    const [ providers, setProviders ] = useState<ProviderPreset[]>(PROVIDER_FALLBACK);
    const [ catalog, setCatalog ] = useState<CatalogModel[]>([ ]);

    const [ discovered, setDiscovered ] = useState<string[]>([ ]);
    const [ formProbe, setFormProbe ] = useState<TeamModelProbe | 'testing' | null>(null);
    const [ catalogUrl, setCatalogUrl ] = useState('');
    const [ creating, setCreating ] = useState(false);
    const [ name, setName ] = useState('');
    const [ model, setModel ] = useState('');
    const [ baseUrl, setBaseUrl ] = useState('');
    const [ apiKey, setApiKey ] = useState('');

    const [ contextTokens, setContextTokens ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    const [ arming, setArming ] = useState<number | null>(null);
    const [ probes, setProbes ] = useState<Record<number, TeamModelProbe | 'testing'>>({ });

    const [ edit, setEdit ] = useState<ModelDraft | null>(null);

    useEffect(() =>
    {
        let active = true;

        modelList(teamId)
            .then((payload) =>
            {
                if (active)
                {
                    setModels(payload.models);
                    setPage(payload);
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
                    setProviders(payload.providers);
                }
            })
            .catch(() => { });

        return () =>
        {
            active = false;
        };
    }, [ ]);

    const preset = providers.find((candidate) => candidate.key === provider) ?? providers[0];

    const suggestions = discovered.length > 0 ? discovered : (preset?.models ?? [ ]).map((entry) => entry.id);

    const chooseModel = useCallback((slug: string) =>
    {
        setModel(slug);

        const entry = catalog.find((candidate) => candidate.id === slug.trim())
            ?? preset?.models.find((candidate) => candidate.id === slug.trim());

        if (entry && entry.context > 0)
        {
            setContextTokens(String(entry.context));
        }
    }, [ catalog, preset ]);

    const discover = useCallback(async(url: string) =>
    {
        try
        {
            setDiscovered((await modelProbe(teamId, url, apiKey.trim(), '')).ids ?? [ ]);
        }
        catch
        {
            setDiscovered([ ]);
        }
    }, [ teamId, apiKey ]);

    const chooseProvider = useCallback((key: string, options: ProviderPreset[]) =>
    {
        const next = options.find((candidate) => candidate.key === key);

        setProvider(key);
        setBaseUrl(next?.url ?? '');

        setDiscovered([ ]);
        setFormProbe(null);

        if (next !== undefined && next.url !== '' && !next.catalog)
        {
            void discover(next.url);
        }
    }, [ discover ]);

    const checkEndpoint = useCallback(async() =>
    {
        const url = preset?.catalog === true ? catalogUrl : baseUrl.trim();

        if (url === '')
        {
            return;
        }

        setError(null);
        setFormProbe('testing');

        try
        {
            const probe = await modelProbe(teamId, url, apiKey.trim(), model.trim());

            setFormProbe(probe);
            setDiscovered(probe.ids ?? [ ]);

            if ((probe.context ?? 0) > 0)
            {
                setContextTokens(String(probe.context));
            }
        }
        catch (cause)
        {
            setFormProbe({ ok: false, reason: cause instanceof ApiError ? cause.result : 'REQUEST_FAILED' });
        }
    }, [ teamId, preset, catalogUrl, baseUrl, apiKey, model ]);

    const add = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setBusy(true);

        try
        {
            const url = preset?.catalog === true ? catalogUrl : baseUrl.trim();

            const created = await modelCreate(teamId, name.trim(), model.trim(), url, apiKey.trim(), Number(contextTokens.trim() || 0));

            setModels((current) => [ created, ...current ?? [ ] ]);
            setPage((current) => current && { ...current, total: current.total + 1 });
            setName('');
            setModel('');
            setBaseUrl(preset?.url ?? '');
            setApiKey('');
            setContextTokens('');
            setFormProbe(null);
            setCreating(false);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setBusy(false);
        }
    }, [ teamId, preset, catalogUrl, name, model, baseUrl, apiKey, contextTokens ]);

    const modify = useCallback((item: TeamModel) =>
    {
        setArming(null);
        setError(null);

        setEdit({ id: item.id, name: item.name, model: item.model, baseUrl: item.base_url, apiKey: '', contextTokens: item.context_tokens === 0 ? '' : String(item.context_tokens) });
    }, [ ]);

    const save = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        if (edit === null)
        {
            return;
        }

        setError(null);
        setBusy(true);

        try
        {
            const updated = await modelUpdate(teamId, edit.id, edit.name.trim(), edit.model.trim(), edit.baseUrl.trim(), edit.apiKey.trim(), Number(edit.contextTokens.trim() || 0));

            setModels((current) => current?.map((item) => item.id === updated.id ? updated : item) ?? null);

            setProbes((current) => { const { [edit.id]: _stale, ...rest } = current; return rest; });

            setEdit(null);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setBusy(false);
        }
    }, [ teamId, edit ]);

    const test = useCallback(async(modelId: number) =>
    {
        setProbes((current) => ({ ...current, [modelId]: 'testing' }));

        try
        {
            const probe = await modelTest(teamId, modelId);

            setProbes((current) => ({ ...current, [modelId]: probe }));

            if ((probe.context ?? 0) > 0)
            {
                setModels((current) => current?.map((item) =>
                    item.id === modelId ? { ...item, context_tokens: probe.context as number } : item) ?? null);
            }
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
            setPage((current) => current && { ...current, total: Math.max(0, current.total - 1) });
            setProbes((current) => { const { [modelId]: _done, ...rest } = current; return rest; });
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
            const next = await modelList(teamId, { offset });

            setModels(next.models);
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
            title="Models"
            sub="Endpoints this team can call, their keys and context windows"
            actions={ (
                <Button type="button" icon={ <Plus size={ 18 } aria-hidden="true" /> } onClick={ () => setCreating(true) }>
                    Create model
                </Button>
            ) }
            footer={ page !== null && models !== null && (
                <PaginationFooter page={ page } shown={ models.length } busy={ paging } noun="models" onPage={ (offset) => void goTo(offset) } />
            ) }
        >
            <datalist id="openrouter-models">
                { catalog.map((entry) => (
                    <option key={ entry.id } value={ entry.id }>{ entry.name }{ priceLabel(entry) }</option>
                )) }
            </datalist>

            <datalist id="endpoint-models">
                { suggestions.map((id) => (
                    <option key={ id } value={ id } aria-label={ id } />
                )) }
            </datalist>

            <Modal
                open={ creating }
                title="New model"
                sub="An OpenAI-compatible endpoint this team can call"
                onClose={ () => setCreating(false) }
            >
                <form className={ CLASS_FORM } onSubmit={ add }>
                    <label className={ CLASS_FIELD }>
                        <span className={ CLASS_FIELD_LABEL }>Provider</span>

                        <select
                            className={ CLASS_FIELD_INPUT }
                            value={ preset?.key ?? '' }
                            onChange={ (event) => chooseProvider(event.target.value, providers) }
                        >
                            { providers.map((entry) => (
                                <option value={ entry.key } key={ entry.key }>{ entry.label }</option>
                            )) }
                        </select>

                        { preset?.hint !== undefined && preset.hint !== '' && (
                            <span className={ CLASS_FIELD_HINT }>{ preset.hint }</span>
                        ) }
                    </label>

                    <label className={ CLASS_FIELD }>
                        <span className={ CLASS_FIELD_LABEL }>Label</span>

                        <input
                            className={ CLASS_FIELD_INPUT }
                            value={ name }
                            onChange={ (event) => setName(event.target.value) }
                            minLength={ 2 }
                            maxLength={ 64 }
                            required
                            placeholder="Primary"
                        />
                    </label>

                    <label className={ CLASS_FIELD }>
                        <span className={ CLASS_FIELD_LABEL }>Model name</span>

                        <input
                            className={ CLASS_FIELD_INPUT }
                            value={ model }
                            onChange={ (event) => chooseModel(event.target.value) }
                            maxLength={ 128 }
                            required
                            list={ preset?.catalog === true ? 'openrouter-models' : suggestions.length > 0 ? 'endpoint-models' : undefined }
                            placeholder={ preset?.catalog === true ? 'anthropic/claude-sonnet-4.5' : 'openai/gpt-5' }
                        />
                    </label>

                    { preset?.catalog !== true && (
                        <label className={ CLASS_FIELD }>
                            <span className={ CLASS_FIELD_LABEL }>Compatible URL</span>

                            <input
                                className={ CLASS_FIELD_INPUT }
                                type="url"
                                value={ baseUrl }
                                onChange={ (event) => setBaseUrl(event.target.value) }
                                maxLength={ 256 }
                                required
                                placeholder="https://api.openai.com/v1"
                            />
                        </label>
                    ) }

                    <label className={ CLASS_FIELD }>
                        <span className={ CLASS_FIELD_LABEL }>Context window (tokens)</span>

                        <input
                            className={ CLASS_FIELD_INPUT }
                            type="number"
                            min={ 0 }
                            value={ contextTokens }
                            onChange={ (event) => setContextTokens(event.target.value) }
                            placeholder="detected automatically"
                        />

                        <span className={ CLASS_FIELD_HINT }>
                            Read from the provider when you add the model, and again whenever you press Test.
                            Fill it in only for an endpoint that does not publish its own window; blank falls
                            back to a conservative 8k, which would trim a large model down to it.
                        </span>
                    </label>

                    <label className={ CLASS_FIELD }>
                        <span className={ CLASS_FIELD_LABEL }>{ preset?.key_required === true ? 'API key' : 'API key (blank for none)' }</span>

                        <input
                            className={ CLASS_FIELD_INPUT }
                            type="password"
                            autoComplete="off"
                            spellCheck={ false }
                            value={ apiKey }
                            onChange={ (event) => setApiKey(event.target.value) }
                            maxLength={ 256 }
                            required={ preset?.key_required === true }
                            placeholder={ preset?.key_required === true ? 'sk-or-v1-...' : 'sk-...  (a local router usually needs none)' }
                        />
                    </label>

                    { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

                    <span className={ CLASS_FORM_ACTIONS }>
                        <Button type="submit" disabled={ busy } icon={ <Plus size={ 18 } aria-hidden="true" /> }>
                            { busy ? 'Adding...' : 'Add model' }
                        </Button>

                        <button
                            className={ CLASS_GHOST }
                            type="button"
                            disabled={ formProbe === 'testing' }
                            onClick={ () => void checkEndpoint() }
                        >
                            { formProbe === 'testing' ? 'Checking...' : 'Test connection' }
                        </button>
                    </span>

                    { formProbe !== null && (
                        <output className={ `block ${ CLASS_PROBE[probeState(formProbe)] }` }>
                            { probeLabel(formProbe) }
                            { formProbe !== 'testing' && formProbe.ok && discovered.length > 0
                                && ` · ${ discovered.length } name${ discovered.length === 1 ? '' : 's' } suggested in the model field` }
                        </output>
                    ) }
                </form>
            </Modal>

            <Modal
                open={ edit !== null }
                title="Edit model"
                sub={ edit === null ? undefined : `Leave the key blank to keep the stored one` }
                onClose={ () => setEdit(null) }
            >
                { edit !== null && (
                    <form className={ CLASS_FORM } onSubmit={ save }>
                        <label className={ CLASS_FIELD }>
                            <span className={ CLASS_FIELD_LABEL }>Label</span>

                            <input
                                className={ CLASS_FIELD_INPUT }
                                value={ edit.name }
                                onChange={ (event) => setEdit({ ...edit, name: event.target.value }) }
                                minLength={ 2 }
                                maxLength={ 64 }
                                required
                                placeholder="Label"
                            />
                        </label>

                        <label className={ CLASS_FIELD }>
                            <span className={ CLASS_FIELD_LABEL }>Model name</span>

                            <input
                                className={ CLASS_FIELD_INPUT }
                                value={ edit.model }
                                onChange={ (event) => setEdit({ ...edit, model: event.target.value }) }
                                maxLength={ 128 }
                                required
                                list={ edit.baseUrl.trim() === catalogUrl ? 'openrouter-models' : undefined }
                                placeholder="Model name"
                            />
                        </label>

                        <label className={ CLASS_FIELD }>
                            <span className={ CLASS_FIELD_LABEL }>Compatible URL</span>

                            <input
                                className={ CLASS_FIELD_INPUT }
                                type="url"
                                value={ edit.baseUrl }
                                onChange={ (event) => setEdit({ ...edit, baseUrl: event.target.value }) }
                                maxLength={ 256 }
                                required
                                placeholder="https://api.openai.com/v1"
                            />
                        </label>

                        <label className={ CLASS_FIELD }>
                            <span className={ CLASS_FIELD_LABEL }>Context window (tokens)</span>

                            <input
                                className={ CLASS_FIELD_INPUT }
                                type="number"
                                min={ 0 }
                                value={ edit.contextTokens }
                                onChange={ (event) => setEdit({ ...edit, contextTokens: event.target.value }) }
                                placeholder="Context window in tokens"
                            />
                        </label>

                        <label className={ CLASS_FIELD }>
                            <span className={ CLASS_FIELD_LABEL }>Replacement API key</span>

                            <input
                                className={ CLASS_FIELD_INPUT }
                                type="password"
                                autoComplete="off"
                                spellCheck={ false }
                                value={ edit.apiKey }
                                onChange={ (event) => setEdit({ ...edit, apiKey: event.target.value }) }
                                maxLength={ 256 }
                                placeholder="Leave blank to keep the stored key"
                            />
                        </label>

                        { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

                        <Button type="submit" disabled={ busy }>{ busy ? 'Saving...' : 'Save' }</Button>
                    </form>
                ) }
            </Modal>

            { error !== null && !creating && edit === null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

            { models === null && <p className={ CLASS_NOTE }>Loading models...</p> }

            { models !== null && models.length === 0 && (
                <p className={ CLASS_NOTE }>
                    <Cpu size={ 18 } aria-hidden="true" /> No models yet. Create one with the button above.
                </p>
            ) }

            { models !== null && models.length > 0 && (
                <ul className={ CLASS_CARD_GRID }>
                    { models.map((item) => (
                        <li key={ item.id }>
                            <div className={ CLASS_CARD }>
                                <span className="flex items-center gap-2">
                                    <Cpu size={ 16 } className="shrink-0 text-live" aria-hidden="true" />
                                    <span className={ CLASS_CARD_NAME }>{ item.name }</span>
                                </span>

                                <span className={ CLASS_CARD_META }>{ item.model }</span>

                                <span className={ CLASS_CARD_META }>{ item.base_url }</span>

                                <span className="flex flex-wrap items-center gap-2">
                                    <span className={ CLASS_BADGE_MUTED }>key { item.key_hint }</span>

                                    <span className={ CLASS_BADGE_MUTED }>
                                        { item.context_tokens === 0 ? 'window unknown' : `${ item.context_tokens.toLocaleString() } tokens` }
                                    </span>
                                </span>

                                { probes[item.id] !== undefined && (
                                    <span className={ CLASS_PROBE[probeState(probes[item.id])] }>
                                        { probeLabel(probes[item.id]) }
                                    </span>
                                ) }

                                <span className={ CLASS_CARD_ACTIONS }>
                                    <button
                                        className={ CLASS_GHOST }
                                        type="button"
                                        disabled={ probes[item.id] === 'testing' }
                                        onClick={ () => void test(item.id) }
                                    >
                                        { probes[item.id] === 'testing' ? 'Checking...' : 'Test' }
                                    </button>

                                    <button className={ CLASS_GHOST } type="button" onClick={ () => modify(item) }>
                                        Modify
                                    </button>

                                    <button
                                        className={ arming === item.id ? CLASS_GHOST_ARMED : CLASS_GHOST_DANGER }
                                        type="button"
                                        onClick={ () => void remove(item.id) }
                                    >
                                        { arming === item.id ? 'Confirm' : 'Remove' }
                                    </button>
                                </span>
                            </div>
                        </li>
                    )) }
                </ul>
            ) }
        </Panel>
    );
}
