import { useCallback, useEffect, useState } from 'react';
import { Cpu, Plus } from 'lucide-react';

import { Button } from './Button';
import { PaginationFooter } from './PaginationFooter';
import { Panel } from './Panel';
import { ApiError, modelCatalog, modelCreate, modelList, modelProbe, modelRemove, modelTest, modelUpdate, type CatalogModel, type Paged, type ProviderPreset, type TeamModel, type TeamModelProbe } from '../lib/api';

/**
 * OpenRouter is the default because it needs one key and no url, which is the
 * shortest path from a new team to a working agent. Anything else compatible
 * still works -- it just has to be typed out.
 *
 * The choices themselves come from the server with the catalog, so their urls
 * have one definition. This is the fallback used only until that arrives, and
 * it deliberately lists no urls: a provider address repeated here is one that
 * can drift from the server's.
 */
const PROVIDER_FALLBACK: ProviderPreset[] = [
    { key: 'custom', label: 'Other OpenAI-compatible endpoint', url: '', catalog: false, key_required: false, models: [ ], hint: '' }
];

interface TeamModelsProps
{
    teamId: number;
}

/**
 * A model being modified.
 *
 * The api key starts blank and blank means "keep the stored one": it is
 * write-only, so there is nothing to prefill it with, and demanding it back
 * just to correct a model name would be busywork.
 */
interface ModelDraft
{
    id: number;
    name: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    contextTokens: string;
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

    // A detected window is recorded server-side by the same call, so saying it
    // here explains why the field changed rather than leaving it a surprise.
    const context = (probe.context ?? 0) > 0 ? ` · ${ probe.context?.toLocaleString() } token window` : '';

    return `Connected · ${ probe.models ?? 0 } models · ${ found }${ context }`;
}

/** The OpenAI-compatible model endpoints registered against one team. */
export function TeamModels({ teamId }: TeamModelsProps)
{
    const [ models, setModels ] = useState<TeamModel[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    // Blank means "whichever the server lists first". Holding a key here that
    // the fetched list might not contain would let the select show one option
    // while the form acted on another.
    const [ provider, setProvider ] = useState('');
    const [ providers, setProviders ] = useState<ProviderPreset[]>(PROVIDER_FALLBACK);
    const [ catalog, setCatalog ] = useState<CatalogModel[]>([ ]);

    // Models read from the endpoint being configured, for a provider whose
    // listing cannot come from the shared catalog. Cleared whenever the
    // endpoint changes, so stale names are never suggested for a new url.
    const [ discovered, setDiscovered ] = useState<string[]>([ ]);
    const [ formProbe, setFormProbe ] = useState<TeamModelProbe | 'testing' | null>(null);
    const [ catalogUrl, setCatalogUrl ] = useState('');
    const [ name, setName ] = useState('');
    const [ model, setModel ] = useState('');
    const [ baseUrl, setBaseUrl ] = useState('');
    const [ apiKey, setApiKey ] = useState('');

    // A string, not a number, so the field can be left empty -- empty means
    // "not recorded" and the server falls back to a conservative default,
    // which is different from a deliberate 0.
    const [ contextTokens, setContextTokens ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    // Removing a model cannot be undone -- the key is never sent back, so it
    // cannot be re-entered from anything on screen -- so it takes two clicks.
    const [ arming, setArming ] = useState<number | null>(null);
    const [ probes, setProbes ] = useState<Record<number, TeamModelProbe | 'testing'>>({ });

    // The row being modified, or null. One at a time: two half-finished edits
    // on screen is a way to save the wrong one.
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
                    setProviders(payload.providers);
                }
            })
            .catch(() => { });

        return () =>
        {
            active = false;
        };
    }, [ ]);

    /**
     * The catalog already publishes each model's window, so choosing one fills
     * the field in rather than asking for a number the list already knows.
     *
     * Done here rather than in an effect watching `model`: the pick is the
     * event that should set it, and an effect would also overwrite a number
     * typed by hand the moment the catalog arrived. A slug the catalog does not
     * carry -- self-hosted, or newer than the cache -- leaves the field alone.
     */
    // Derived before the callbacks that read it: `preset` decides which url is
    // used, which models are suggested and whether a key is required.
    const preset = providers.find((candidate) => candidate.key === provider) ?? providers[0];

    /**
     * What the model field offers for a provider with no shared catalog.
     *
     * What the endpoint itself listed wins: it answered for its own account,
     * where the documented names are only what was true when they were written.
     * Falling back to them means a provider that serves no listing is still
     * usable without looking a model name up.
     */
    const suggestions = discovered.length > 0 ? discovered : (preset?.models ?? [ ]).map((entry) => entry.id);

    const chooseModel = useCallback((slug: string) =>
    {
        setModel(slug);

        // The catalog first, then whatever the provider documents. A provider
        // that serves no listing would otherwise leave every model on the
        // conservative default, which silently trims a large one down to it.
        const entry = catalog.find((candidate) => candidate.id === slug.trim())
            ?? preset?.models.find((candidate) => candidate.id === slug.trim());

        if (entry && entry.context > 0)
        {
            setContextTokens(String(entry.context));
        }
    }, [ catalog, preset ]);


    /**
     * Switching provider prefills its url rather than hiding one.
     *
     * OpenRouter's root is fixed and comes with the catalog, so its field stays
     * hidden. Every other root is shown, filled in where one is known, and
     * editable -- an endpoint can be proxied, and a custom one has no default.
     */
    /**
     * Reads an endpoint's model names into the suggestions, quietly.
     *
     * Failure is silent: this runs because a provider was selected, not
     * because anyone asked for a check, and an error over a url the user has
     * not finished looking at would be noise. "Test connection" is where a
     * result belongs.
     */
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

        // A different endpoint lists different models, so anything discovered
        // for the last one stops being a suggestion immediately.
        setDiscovered([ ]);
        setFormProbe(null);

        // A provider with a known address and no shared catalog can be asked
        // for its list right away -- that is what its url being a prefill is
        // for. One typed by hand is not fetched until it is tested, since a
        // half-typed url is not worth a request.
        if (next !== undefined && next.url !== '' && !next.catalog)
        {
            void discover(next.url);
        }
    }, [ discover ]);

    /**
     * Checks the endpoint in the form and remembers what it lists.
     *
     * One call answers both questions the form has before anything is saved:
     * whether the endpoint works, and which models it offers. A provider whose
     * listing depends on your own key cannot come from the catalog everyone
     * shares, so it is read here instead.
     */
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

            // The endpoint is authoritative about its own window, so a detected
            // one fills the field rather than being reported and forgotten.
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
            // The provider url is the server's, not a constant duplicated here.
            // A provider with its own catalog owns its root; everything else is
            // whatever is in the field, prefilled or typed.
            const url = preset?.catalog === true ? catalogUrl : baseUrl.trim();

            const created = await modelCreate(teamId, name.trim(), model.trim(), url, apiKey.trim(), Number(contextTokens.trim() || 0));

            setModels((current) => [ created, ...current ?? [ ] ]);
            setPage((current) => current && { ...current, total: current.total + 1 });
            setName('');
            setModel('');
            // Back to this provider's default rather than blank: the next model
            // is usually added against the same endpoint.
            setBaseUrl(preset?.url ?? '');
            setApiKey('');
            setContextTokens('');
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

    /**
     * Opens a row for modification, or closes the one already open.
     *
     * Disarms a pending Remove on the way: the two buttons sit together, and
     * leaving a red "Confirm" next to a newly opened editor invites a click
     * that deletes the model instead of editing it.
     */
    const modify = useCallback((item: TeamModel) =>
    {
        setArming(null);
        setError(null);

        setEdit((current) => current?.id === item.id
            ? null
            : { id: item.id, name: item.name, model: item.model, baseUrl: item.base_url, apiKey: '', contextTokens: item.context_tokens === 0 ? '' : String(item.context_tokens) });
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

            // The endpoint may be a different one now, so an earlier probe no
            // longer describes what is configured -- better blank than stale.
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

            // The server records a detected window on this same call, so the
            // row on screen is stale the moment it comes back.
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
            footer={ page !== null && models !== null && (
                <PaginationFooter page={ page } shown={ models.length } busy={ paging } noun="models" onPage={ (offset) => void goTo(offset) } />
            ) }
        >
            {/* Rendered once for the whole section: the add form and any row
                being modified offer the same suggestions, and an id may only
                belong to one element. */}
            <datalist id="openrouter-models">
                { catalog.map((entry) => (
                    <option key={ entry.id } value={ entry.id }>{ entry.name }{ priceLabel(entry) }</option>
                )) }
            </datalist>

            { /* Names read from the endpoint being configured. No prices: a
                 listing tells us what it serves, not what it charges. */ }
            <datalist id="endpoint-models">
                { suggestions.map((id) => (
                    <option key={ id } value={ id } aria-label={ id } />
                )) }
            </datalist>

            <form className="form mt-0" onSubmit={ add }>
                <label className="field">
                    <span className="field__label">Provider</span>

                    <select
                        className="field__input"
                        value={ preset?.key ?? '' }
                        onChange={ (event) => chooseProvider(event.target.value, providers) }
                    >
                        { providers.map((entry) => (
                            <option value={ entry.key } key={ entry.key }>{ entry.label }</option>
                        )) }
                    </select>

                    { preset?.hint !== undefined && preset.hint !== '' && (
                        <span className="field__hint">{ preset.hint }</span>
                    ) }
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
                        onChange={ (event) => chooseModel(event.target.value) }
                        maxLength={ 128 }
                        required
                        // A datalist rather than a select: the list is long, the
                        // browser filters it as you type for free, and a model
                        // released since the catalog was cached can still be typed.
                        list={ preset?.catalog === true ? 'openrouter-models' : suggestions.length > 0 ? 'endpoint-models' : undefined }
                        placeholder={ preset?.catalog === true ? 'anthropic/claude-sonnet-4.5' : 'openai/gpt-5' }
                    />
                </label>

                { preset?.catalog !== true && (
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
                    <span className="field__label">Context window (tokens)</span>

                    <input
                        className="field__input"
                        type="number"
                        min={ 0 }
                        value={ contextTokens }
                        onChange={ (event) => setContextTokens(event.target.value) }
                        placeholder="detected automatically"
                    />

                    <span className="field__hint">
                        Read from the provider when you add the model, and again whenever you press Test.
                        Fill it in only for an endpoint that does not publish its own window; blank falls
                        back to a conservative 8k, which would trim a large model down to it.
                    </span>
                </label>

                <label className="field">
                    <span className="field__label">{ preset?.key_required === true ? 'API key' : 'API key (blank for none)' }</span>

                    <input
                        className="field__input"
                        // A credential, and write-only once stored.
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

                <span className="form__actions">
                    <Button type="submit" disabled={ busy } icon={ <Plus size={ 18 } aria-hidden="true" /> }>
                        { busy ? 'Adding...' : 'Add model' }
                    </Button>

                    { /* Deliberately not a submit: checking an endpoint should
                         never be one stray Enter away from saving it. */ }
                    <button
                        className="ghost"
                        type="button"
                        disabled={ formProbe === 'testing' }
                        onClick={ () => void checkEndpoint() }
                    >
                        { formProbe === 'testing' ? 'Checking...' : 'Test connection' }
                    </button>
                </span>

                { formProbe !== null && (
                    <output className="probe probe--form" data-state={ probeState(formProbe) }>
                        { probeLabel(formProbe) }
                        { formProbe !== 'testing' && formProbe.ok && discovered.length > 0
                            && ` · ${ discovered.length } name${ discovered.length === 1 ? '' : 's' } suggested in the model field` }
                    </output>
                ) }
            </form>

            { error !== null && <p className="note" data-state="error" role="alert">{ error }</p> }

            { models === null && <p className="note">Loading models...</p> }

            { models !== null && models.length === 0 && (
                <p className="note">
                    <Cpu size={ 18 } aria-hidden="true" /> No models yet. Add one above.
                </p>
            ) }

            { models !== null && models.length > 0 && (
                <ul className="rows">
                    { models.map((item) => (
                        <li className="rows__item rows__item--row" key={ item.id }>
                            <span className="rows__text">
                                <span className="rows__name">{ item.name }</span>

                                <span className="rows__meta">{ item.model } · { item.base_url } · key { item.key_hint }</span>

                                { probes[item.id] !== undefined && (
                                    <span className="probe" data-state={ probeState(probes[item.id]) }>
                                        { probeLabel(probes[item.id]) }
                                    </span>
                                ) }
                            </span>

                            <span className="rows__actions">
                                <button
                                    className="ghost"
                                    type="button"
                                    disabled={ probes[item.id] === 'testing' }
                                    onClick={ () => void test(item.id) }
                                >
                                    { probes[item.id] === 'testing' ? 'Checking...' : 'Test Connectivity' }
                                </button>

                                <button
                                    className="ghost"
                                    type="button"
                                    aria-expanded={ edit?.id === item.id }
                                    onClick={ () => modify(item) }
                                >
                                    { edit?.id === item.id ? 'Cancel' : 'Modify' }
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

                            { edit?.id === item.id && (
                                <form className="rows__url" onSubmit={ save }>
                                    <input
                                        className="field__input"
                                        aria-label={ `Label for ${ item.name }` }
                                        value={ edit.name }
                                        onChange={ (event) => setEdit({ ...edit, name: event.target.value }) }
                                        minLength={ 2 }
                                        maxLength={ 64 }
                                        required
                                        placeholder="Label"
                                    />

                                    <input
                                        className="field__input"
                                        aria-label={ `Model name for ${ item.name }` }
                                        value={ edit.model }
                                        onChange={ (event) => setEdit({ ...edit, model: event.target.value }) }
                                        maxLength={ 128 }
                                        required
                                        // Suggestions only where they apply: the catalog
                                        // describes the default provider, not an arbitrary
                                        // compatible endpoint.
                                        list={ edit.baseUrl.trim() === catalogUrl ? 'openrouter-models' : undefined }
                                        placeholder="Model name"
                                    />

                                    <input
                                        className="field__input"
                                        type="url"
                                        aria-label={ `Compatible URL for ${ item.name }` }
                                        value={ edit.baseUrl }
                                        onChange={ (event) => setEdit({ ...edit, baseUrl: event.target.value }) }
                                        maxLength={ 256 }
                                        required
                                        placeholder="https://api.openai.com/v1"
                                    />

                                    <input
                                        className="field__input"
                                        type="number"
                                        min={ 0 }
                                        aria-label={ `Context window in tokens for ${ item.name }` }
                                        value={ edit.contextTokens }
                                        onChange={ (event) => setEdit({ ...edit, contextTokens: event.target.value }) }
                                        placeholder="Context window in tokens"
                                    />

                                    <input
                                        className="field__input"
                                        type="password"
                                        autoComplete="off"
                                        spellCheck={ false }
                                        aria-label={ `Replacement API key for ${ item.name }` }
                                        value={ edit.apiKey }
                                        onChange={ (event) => setEdit({ ...edit, apiKey: event.target.value }) }
                                        maxLength={ 256 }
                                        placeholder={ `Leave blank to keep key ${ item.key_hint }` }
                                    />

                                    <button className="ghost" type="submit" disabled={ busy }>
                                        { busy ? 'Saving...' : 'Save' }
                                    </button>
                                </form>
                            ) }
                        </li>
                    )) }
                </ul>
            ) }

        </Panel>
    );
}
