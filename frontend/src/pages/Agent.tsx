import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FilePlus, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { Button, ButtonLink } from '../components/Button';
import {
    ApiError, agentDetails, agentDocumentCreate, agentDocumentRemove, agentDocumentUpdate,
    agentUpdate, modelList, type AgentDocument, type TeamAgent, type TeamModel } from '../lib/api';
import { clearAccessToken, readAccessToken } from '../lib/session';

/** One markdown file, edited in place. */
function DocumentEditor({ teamId, agentId, document, onSaved, onRemoved }: {
    teamId: number;
    agentId: number;
    document: AgentDocument;
    onSaved: (document: AgentDocument) => void;
    onRemoved: (id: number) => void;
})
{
    // Seeded once: the caller keys this component by document id, so a
    // different file remounts it rather than needing a reset effect. After a
    // save the parent's copy already matches what is typed here, which is what
    // clears `dirty`.
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
        <article className="doc">
            <header className="doc__head">
                <span className="doc__name">{ document.name }</span>

                <span className="list__actions">
                    <button className="ghost" type="button" disabled={ busy || !dirty } onClick={ () => void save() }>
                        { busy ? 'Saving...' : dirty ? 'Save' : 'Saved' }
                    </button>

                    <button
                        className="ghost ghost--danger"
                        type="button"
                        data-state={ arming ? 'armed' : undefined }
                        onClick={ () => void remove() }
                    >
                        { arming ? 'Confirm' : 'Remove' }
                    </button>
                </span>
            </header>

            <textarea
                className="doc__editor"
                value={ content }
                onChange={ (event) => setContent(event.target.value) }
                spellCheck={ false }
                rows={ 12 }
                aria-label={ `Contents of ${ document.name }` }
            />

            { error !== null && <p className="status" data-state="error" role="alert">{ error }</p> }
        </article>
    );
}

/** An agent's own page: what it is, which model it uses, and its markdown files. */
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

        Promise.all([ agentDetails(teamId, thisAgent), modelList(teamId) ])
            .then(([ details, modelPayload ]) =>
            {
                if (!active)
                {
                    return;
                }

                setAgent(details.agent);
                setDocuments(details.documents);
                setModels(modelPayload.models);
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

    const shown = idsInvalid ? 'AGENT_ID_INVALID' : error;

    return (
        <section className="panel">
            <header className="panel__head">
                <h1 className="panel__title">{ agent?.name ?? 'Agent' }</h1>

                <ButtonLink to={ `/dashboard/team/${ teamId }` } icon={ <ArrowLeft size={ 18 } aria-hidden="true" /> }>
                    Back
                </ButtonLink>
            </header>

            { agent === null && shown === null && <p className="status">Loading agent...</p> }

            { shown !== null && <p className="status" data-state="error" role="alert">{ shown }</p> }

            { agent !== null && (
                <>
                    <section className="section">
                        <h2 className="section__title">Settings</h2>

                        { agent.model_name === '' && (
                            <p className="status" data-state="error">
                                No model attached — the model this agent used was removed. Pick another below.
                            </p>
                        ) }

                        <form className="form" onSubmit={ saveAgent }>
                            <label className="field">
                                <span className="field__label">Name</span>

                                <input
                                    className="field__input"
                                    value={ name }
                                    onChange={ (event) => setName(event.target.value) }
                                    minLength={ 2 }
                                    maxLength={ 64 }
                                    required
                                />
                            </label>

                            <label className="field">
                                <span className="field__label">Description</span>

                                <input
                                    className="field__input"
                                    value={ description }
                                    onChange={ (event) => setDescription(event.target.value) }
                                    maxLength={ 280 }
                                    placeholder="Optional"
                                />
                            </label>

                            <label className="field">
                                <span className="field__label">Model</span>

                                <select
                                    className="field__input"
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

                        { saved && <output className="status">Saved.</output> }
                    </section>

                    <section className="section">
                        <h2 className="section__title">Files</h2>

                        <p className="status">These markdown files define what this agent does.</p>

                        <form className="form" onSubmit={ addDocument }>
                            <label className="field">
                                <span className="field__label">New file</span>

                                <input
                                    className="field__input"
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
                    </section>
                </>
            ) }
        </section>
    );
}
