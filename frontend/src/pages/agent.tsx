import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FilePlus, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { Button, ButtonLink } from '../components/ui/Button';
import { PaginationFooter } from '../components/ui/PaginationFooter';
import { Panel, PageHead } from '../components/ui/Panel';
import {
    ApiError, agentDetails, agentDocumentCreate, agentDocumentRemove, agentDocumentUpdate,
    agentExchanges, agentPermissionCatalog, agentPermissionUpdate, agentUpdate, modelList,
    type AgentDocument, type AgentExchange, type Paged, type Permission, type TeamAgent, type TeamModel } from '../api';
import { clearAccessToken, readAccessToken } from '../lib/session';
import { tokenLabel } from '../lib/tokens';

import {
    CLASS_DOC,
    CLASS_DOC_COST,
    CLASS_DOC_EDITOR,
    CLASS_DOC_HEAD,
    CLASS_DOC_NAME,
    CLASS_DOC_READER,
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
    CLASS_ROW_META,
    CLASS_ROW_NAME,
    CLASS_ROW_TEXT
} from '../lib/constant';

function alwaysSent(name: string, content: string): boolean
{
    return name === 'instructions.md' || name === 'guardrails.md' || content.trim().length <= 400;
}

function DocumentEditor({ teamId, agentId, document, onSaved, onRemoved }: {
    teamId: number;
    agentId: number;
    document: AgentDocument;
    onSaved: (document: AgentDocument) => void;
    onRemoved: (id: number) => void;
})
{
    const [ content, setContent ] = useState(document.content);
    const [ busy, setBusy ] = useState(false);
    const [ arming, setArming ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    const dirty = content !== document.content;

    const save = useCallback(async() =>
    {
        setError(null);
        setBusy(true);

        try
        {
            onSaved(await agentDocumentUpdate(teamId, agentId, document.id, document.name, content));
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setBusy(false);
        }
    }, [ teamId, agentId, document.id, document.name, content, onSaved ]);

    const remove = useCallback(async() =>
    {
        if (!arming)
        {
            setArming(true);

            return;
        }

        setArming(false);

        try
        {
            await agentDocumentRemove(teamId, agentId, document.id);

            onRemoved(document.id);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
    }, [ teamId, agentId, document.id, arming, onRemoved ]);

    return (
        <article className={ CLASS_DOC }>
            <header className={ CLASS_DOC_HEAD }>
                <span className={ CLASS_DOC_NAME }>{ document.name }</span>


                <span
                    className={ alwaysSent(document.name, content) ? CLASS_DOC_COST : `${ CLASS_DOC_COST } opacity-60` }
                    title={ alwaysSent(document.name, content)
                        ? 'Estimated tokens, sent on every message this agent answers'
                        : 'Estimated tokens, charged only when the agent opens this file' }
                >
                    { tokenLabel(content) } · { alwaysSent(document.name, content) ? 'every message' : 'on demand' }
                </span>

                <span className={ CLASS_ROW_ACTIONS }>
                    <button className={ CLASS_GHOST } type="button" disabled={ busy || !dirty } onClick={ () => void save() }>
                        { busy ? 'Saving...' : dirty ? 'Save' : 'Saved' }
                    </button>

                    <button
                        className={ arming ? CLASS_GHOST_ARMED : CLASS_GHOST_DANGER }
                        type="button"
                        onClick={ () => void remove() }
                    >
                        { arming ? 'Confirm' : 'Remove' }
                    </button>
                </span>
            </header>

            <textarea
                className={ CLASS_DOC_EDITOR }
                value={ content }
                onChange={ (event) => setContent(event.target.value) }
                spellCheck={ false }
                rows={ 12 }
                aria-label={ `Contents of ${ document.name }` }
            />

            { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }
        </article>
    );
}

export function Agent()
{
    const navigate = useNavigate();

    const { id, agentId } = useParams<{ id: string; agentId: string }>();

    const teamId = Number(id);
    const thisAgent = Number(agentId);

    const idsInvalid = !Number.isInteger(teamId) || teamId < 1 || !Number.isInteger(thisAgent) || thisAgent < 1;

    const [ agent, setAgent ] = useState<TeamAgent | null>(null);
    const [ documents, setDocuments ] = useState<AgentDocument[]>([ ]);
    const [ models, setModels ] = useState<TeamModel[]>([ ]);
    const [ error, setError ] = useState<string | null>(null);

    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ modelId, setModelId ] = useState('');
    const [ savingAgent, setSavingAgent ] = useState(false);
    const [ saved, setSaved ] = useState(false);

    const [ newName, setNewName ] = useState('');
    const [ addingFile, setAddingFile ] = useState(false);

    const [ capabilities, setCapabilities ] = useState<Permission[]>([ ]);
    const [ savingCapability, setSavingCapability ] = useState<string | null>(null);
    const [ exchanges, setExchanges ] = useState<AgentExchange[]>([ ]);
    const [ exchangePage, setExchangePage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ openExchange, setOpenExchange ] = useState<number | null>(null);

    useEffect(() =>
    {
        if (readAccessToken() === null)
        {
            void navigate('/', { replace: true });

            return;
        }

        if (idsInvalid)
        {
            return;
        }

        let active = true;

        Promise.all([ agentDetails(teamId, thisAgent), modelList(teamId), agentPermissionCatalog(teamId), agentExchanges(teamId, thisAgent) ])
            .then(([ details, modelPayload, catalog, exchangePayload ]) =>
            {
                if (!active)
                {
                    return;
                }

                setAgent(details.agent);
                setDocuments(details.documents);
                setModels(modelPayload.models);
                setCapabilities(catalog.permissions);
                setExchanges(exchangePayload.exchanges);
                setExchangePage(exchangePayload);
                setName(details.agent.name);
                setDescription(details.agent.description);
                setModelId(String(details.agent.model_id));
            })
            .catch((cause: unknown) =>
            {
                if (!active)
                {
                    return;
                }

                if (cause instanceof ApiError && cause.status === 401)
                {
                    clearAccessToken();

                    void navigate('/', { replace: true });

                    return;
                }

                setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId, thisAgent, idsInvalid, navigate ]);

    const saveAgent = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setSaved(false);
        setSavingAgent(true);

        try
        {
            const updated = await agentUpdate(teamId, thisAgent, name.trim(), description.trim(), Number(modelId));

            setAgent(updated);
            setSaved(true);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setSavingAgent(false);
        }
    }, [ teamId, thisAgent, name, description, modelId ]);

    const goToExchanges = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await agentExchanges(teamId, thisAgent, { offset });

            setExchanges(next.exchanges);
            setExchangePage(next);
            setOpenExchange(null);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setPaging(false);
        }
    }, [ teamId, thisAgent ]);

    const addDocument = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setAddingFile(true);

        try
        {
            const created = await agentDocumentCreate(teamId, thisAgent, newName.trim(), `# ${ newName.trim().replace(/\.md$/, '') }\n\n`);

            setDocuments((current) => [ ...current, created ].sort((a, b) => a.name.localeCompare(b.name)));
            setNewName('');
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setAddingFile(false);
        }
    }, [ teamId, thisAgent, newName ]);

    const toggleCapability = useCallback(async(key: string) =>
    {
        if (agent === null)
        {
            return;
        }

        const next = agent.permissions.includes(key)
            ? agent.permissions.filter((item) => item !== key)
            : [ ...agent.permissions, key ];

        setError(null);
        setSavingCapability(key);

        try
        {
            setAgent(await agentPermissionUpdate(teamId, thisAgent, next));
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setSavingCapability(null);
        }
    }, [ teamId, thisAgent, agent ]);

    const shown = idsInvalid ? 'AGENT_ID_INVALID' : error;

    return (
        <>
            <PageHead
                title={ agent?.name ?? 'Agent' }
                sub={ agent === null ? undefined : agent.description !== '' ? agent.description : agent.model_name !== '' ? agent.model_name : 'no model attached' }
                actions={ (
                    <ButtonLink to={ `/dashboard/team/${ teamId }/agents` } icon={ <ArrowLeft size={ 18 } aria-hidden="true" /> }>
                        Back
                    </ButtonLink>
                ) }
            />

            { agent === null && shown === null && <p className={ CLASS_NOTE }>Loading agent...</p> }

            { shown !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ shown }</p> }

            { agent !== null && (
                <>
                    <Panel title="Settings" sub="What this agent is, and the model it is bound to">
                        { agent.model_name === '' && (
                            <p className={ CLASS_NOTE_ERROR }>
                                No model attached — the model this agent used was removed. Pick another below.
                            </p>
                        ) }

                        <form className={ CLASS_FORM } onSubmit={ saveAgent }>
                            <label className={ CLASS_FIELD }>
                                <span className={ CLASS_FIELD_LABEL }>Name</span>

                                <input
                                    className={ CLASS_FIELD_INPUT }
                                    value={ name }
                                    onChange={ (event) => setName(event.target.value) }
                                    minLength={ 2 }
                                    maxLength={ 64 }
                                    required
                                />
                            </label>

                            <label className={ CLASS_FIELD }>
                                <span className={ CLASS_FIELD_LABEL }>Description</span>

                                <input
                                    className={ CLASS_FIELD_INPUT }
                                    value={ description }
                                    onChange={ (event) => setDescription(event.target.value) }
                                    maxLength={ 280 }
                                    placeholder="Optional"
                                />
                            </label>

                            <label className={ CLASS_FIELD }>
                                <span className={ CLASS_FIELD_LABEL }>Model</span>

                                <select
                                    className={ CLASS_FIELD_INPUT }
                                    value={ modelId }
                                    onChange={ (event) => setModelId(event.target.value) }
                                    required
                                >
                                    { agent.model_id === 0 && <option value="0" disabled>Select a model</option> }

                                    { models.map((model) => (
                                        <option key={ model.id } value={ model.id }>{ model.name } · { model.model }</option>
                                    )) }
                                </select>
                            </label>

                            <Button type="submit" disabled={ savingAgent } icon={ <Save size={ 18 } aria-hidden="true" /> }>
                                { savingAgent ? 'Saving...' : 'Save changes' }
                            </Button>
                        </form>

                        { saved && <output className={ CLASS_NOTE }>Saved.</output> }
                    </Panel>

                    <Panel title="Capabilities" sub="What this agent may do through the internal tools, for every person it talks to. Every capability is off until granted">
                        <ul className={ CLASS_ROWS }>
                            { capabilities.map((capability) =>
                            {
                                const granted = agent.permissions.includes(capability.key);

                                return (
                                    <li className={ CLASS_ROW } key={ capability.key }>
                                        <span className={ CLASS_ROW_TEXT }>
                                            <span className={ CLASS_ROW_NAME }>{ capability.label }</span>
                                            <span className={ CLASS_ROW_META }>{ capability.description }</span>
                                        </span>

                                        <button
                                            className={ granted ? CLASS_GHOST : CLASS_GHOST_DANGER }
                                            type="button"
                                            disabled={ savingCapability === capability.key }
                                            aria-pressed={ granted }
                                            onClick={ () => void toggleCapability(capability.key) }
                                        >
                                            { savingCapability === capability.key ? 'Saving...' : granted ? 'Allowed' : 'Denied' }
                                        </button>
                                    </li>
                                );
                            }) }
                        </ul>
                    </Panel>

                    <Panel
                        title="Model conversations"
                        sub="Every round-trip as the model saw it: system prompt, replayed history, tool calls and results"
                        footer={ exchangePage !== null && (
                            <PaginationFooter page={ exchangePage } shown={ exchanges.length } busy={ paging } noun="exchanges" onPage={ (offset) => void goToExchanges(offset) } />
                        ) }
                    >
                        { exchanges.length === 0 && <p className={ CLASS_NOTE }>Nothing recorded yet.</p> }

                        { exchanges.map((exchange) => (
                            <article className={ CLASS_DOC } key={ exchange.id }>
                                <header className={ CLASS_DOC_HEAD }>
                                    <span className={ CLASS_DOC_NAME }>
                                        round { exchange.round }
                                        <span className={ CLASS_ROW_META }> { new Date(exchange.created_at).toLocaleString() }</span>
                                    </span>

                                    <span className={ CLASS_ROW_ACTIONS }>
                                        <span className={ CLASS_ROW_META }>
                                            { exchange.duration_ms }ms, { exchange.tool_calls } tool calls
                                        </span>

                                        <span className={ CLASS_PROBE[exchange.outcome === 'ok' ? 'ok' : 'error'] }>
                                            { exchange.outcome }{ exchange.reason !== '' && ` ${ exchange.reason }` }
                                        </span>

                                        <button
                                            className={ CLASS_GHOST }
                                            type="button"
                                            aria-expanded={ openExchange === exchange.id }
                                            onClick={ () => setOpenExchange(openExchange === exchange.id ? null : exchange.id) }
                                        >
                                            { openExchange === exchange.id ? 'Hide' : 'Show' }
                                        </button>
                                    </span>
                                </header>

                                { openExchange === exchange.id && (
                                    <>
                                        <span className={ CLASS_FIELD_LABEL }>Request</span>
                                        <pre className={ CLASS_DOC_READER }>{ exchange.request }</pre>

                                        <span className={ CLASS_FIELD_LABEL }>Response</span>
                                        <pre className={ CLASS_DOC_READER }>{ exchange.response }</pre>
                                    </>
                                ) }
                            </article>
                        )) }
                    </Panel>

                    <Panel title="Files" sub="The markdown that defines how this agent behaves">
                        <form className={ CLASS_FORM } onSubmit={ addDocument }>
                            <label className={ CLASS_FIELD }>
                                <span className={ CLASS_FIELD_LABEL }>New file</span>

                                <input
                                    className={ CLASS_FIELD_INPUT }
                                    value={ newName }
                                    onChange={ (event) => setNewName(event.target.value) }
                                    pattern="[A-Za-z0-9][A-Za-z0-9._\-]*\.md"
                                    title="A markdown filename, e.g. examples.md"
                                    maxLength={ 64 }
                                    required
                                    placeholder="examples.md"
                                />
                            </label>

                            <Button type="submit" disabled={ addingFile } icon={ <FilePlus size={ 18 } aria-hidden="true" /> }>
                                { addingFile ? 'Adding...' : 'Add file' }
                            </Button>
                        </form>

                        { documents.map((document) => (
                            <DocumentEditor
                                key={ document.id }
                                teamId={ teamId }
                                agentId={ thisAgent }
                                document={ document }
                                onSaved={ (updated) => setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item)) }
                                onRemoved={ (removedId) => setDocuments((current) => current.filter((item) => item.id !== removedId)) }
                            />
                        )) }
                    </Panel>
                </>
            ) }
        </>
    );
}
