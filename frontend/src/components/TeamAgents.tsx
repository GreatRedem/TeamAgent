import { useCallback, useEffect, useState } from 'react';
import { Bot, FileText, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { ApiError, agentCreate, agentList, modelList, type Paged, type TeamAgent, type TeamModel } from '../api';
import {
    CLASS_BADGE,
    CLASS_BADGE_MUTED,
    CLASS_CARD_BODY,
    CLASS_CARD_GRID,
    CLASS_CARD_LINK,
    CLASS_CARD_NAME,
    CLASS_FIELD,
    CLASS_FIELD_INPUT,
    CLASS_FIELD_LABEL,
    CLASS_FORM,
    CLASS_NOTE,
    CLASS_NOTE_ERROR
} from '../lib/constant';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { PaginationFooter } from './ui/PaginationFooter';
import { Panel } from './ui/Panel';

export function TeamAgents({ teamId }: { teamId: number })
{
    const [ agents, setAgents ] = useState<TeamAgent[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ models, setModels ] = useState<TeamModel[] | null>(null);

    const [ creating, setCreating ] = useState(false);
    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ modelId, setModelId ] = useState('');

    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        let active = true;

        Promise.all([ agentList(teamId), modelList(teamId) ])
            .then(([ agentPayload, modelPayload ]) =>
            {
                if (!active)
                {
                    return;
                }

                setAgents(agentPayload.agents);
                setPage(agentPayload);
                setModels(modelPayload.models);

                if (modelPayload.models.length > 0)
                {
                    setModelId(String(modelPayload.models[0].id));
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setAgents([ ]);
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
            const agent = await agentCreate(teamId, name.trim(), description.trim(), Number(modelId));

            setAgents((current) => [ agent, ...current ?? [ ] ]);
            setPage((current) => current && { ...current, total: current.total + 1 });
            setName('');
            setDescription('');
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
    }, [ teamId, name, description, modelId ]);

    const goTo = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await agentList(teamId, { offset });

            setAgents(next.agents);
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

    const hasModels = models !== null && models.length > 0;

    return (
        <Panel
            title="Agents"
            sub="What each agent is, the model it uses and the files that define it"
            actions={ (
                <Button type="button" disabled={ !hasModels } icon={ <Plus size={ 18 } aria-hidden="true" /> } onClick={ () => setCreating(true) }>
                    Create agent
                </Button>
            ) }
            footer={ page !== null && agents !== null && (
                <PaginationFooter page={ page } shown={ agents.length } busy={ paging } noun="agents" onPage={ (offset) => void goTo(offset) } />
            ) }
        >
            <Modal
                open={ creating }
                title="New agent"
                sub="An agent is a named role bound to one of the team's models"
                onClose={ () => setCreating(false) }
            >
                <form className={ CLASS_FORM } onSubmit={ add }>
                    <label className={ CLASS_FIELD }>
                        <span className={ CLASS_FIELD_LABEL }>Name</span>

                        <input
                            className={ CLASS_FIELD_INPUT }
                            value={ name }
                            onChange={ (event) => setName(event.target.value) }
                            minLength={ 2 }
                            maxLength={ 64 }
                            required
                            placeholder="Support agent"
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
                            { models?.map((model) => (
                                <option key={ model.id } value={ model.id }>{ model.name } · { model.model }</option>
                            )) }
                        </select>
                    </label>

                    { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

                    <Button type="submit" disabled={ busy } icon={ <Plus size={ 18 } aria-hidden="true" /> }>
                        { busy ? 'Creating...' : 'Create agent' }
                    </Button>
                </form>
            </Modal>

            { models !== null && !hasModels && (
                <p className={ CLASS_NOTE_ERROR }>Add a model first — an agent has to be attached to one.</p>
            ) }

            { error !== null && !creating && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

            { agents === null && <p className={ CLASS_NOTE }>Loading agents...</p> }

            { agents !== null && agents.length === 0 && (
                <p className={ CLASS_NOTE }>
                    <Bot size={ 18 } aria-hidden="true" /> No agents yet.
                </p>
            ) }

            { agents !== null && agents.length > 0 && (
                <ul className={ CLASS_CARD_GRID }>
                    { agents.map((agent) => (
                        <li key={ agent.id }>
                            <Link className={ CLASS_CARD_LINK } to={ `/dashboard/team/${ teamId }/agent/${ agent.id }` }>
                                <span className="flex items-center gap-2">
                                    <Bot size={ 16 } className="shrink-0 text-live" aria-hidden="true" />
                                    <span className={ CLASS_CARD_NAME }>{ agent.name }</span>
                                </span>

                                <span className={ CLASS_CARD_BODY }>
                                    { agent.description === '' ? 'No description' : agent.description }
                                </span>

                                <span className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                                    <span className={ agent.model_name === '' ? CLASS_BADGE_MUTED : CLASS_BADGE }>
                                        { agent.model_name === '' ? 'no model' : agent.model_name }
                                    </span>

                                    <span className={ CLASS_BADGE_MUTED }>
                                        <FileText size={ 11 } className="me-1" aria-hidden="true" />
                                        { agent.document_count } file{ agent.document_count === 1 ? '' : 's' }
                                    </span>
                                </span>
                            </Link>
                        </li>
                    )) }
                </ul>
            ) }
        </Panel>
    );
}
