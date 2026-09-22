import { useCallback, useEffect, useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from './Button';
import { PaginationFooter } from './PaginationFooter';
import { Panel } from './Panel';
import { ApiError, agentCreate, agentList, modelList, type Paged, type TeamAgent, type TeamModel } from '../lib/api';

interface TeamAgentsProps
{
    teamId: number;
}

/**
 * The team's agents.
 *
 * An agent has to be bound to a model, so the form loads the team's models and
 * offers them as a choice; with none configured there is nothing valid to
 * submit and the form says so rather than failing on send.
 */
export function TeamAgents({ teamId }: TeamAgentsProps)
{
    const [ agents, setAgents ] = useState<TeamAgent[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ models, setModels ] = useState<TeamModel[] | null>(null);

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

                // Preselect, so the common case is one click.
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

    const hasModels = models !== null && models.length > 0;

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

    return (
        <Panel
            title="Agents"
            sub="What each agent is, the model it uses and the files that define it"
            footer={ page !== null && agents !== null && (
                <PaginationFooter page={ page } shown={ agents.length } busy={ paging } noun="agents" onPage={ (offset) => void goTo(offset) } />
            ) }
        >
            { models !== null && !hasModels && (
                <p className="note" data-state="error">
                    Add a model first — an agent has to be attached to one.
                </p>
            ) }

            { hasModels && (
                <form className="form mt-0" onSubmit={ add }>
                    <label className="field">
                        <span className="field__label">Name</span>

                        <input
                            className="field__input"
                            value={ name }
                            onChange={ (event) => setName(event.target.value) }
                            minLength={ 2 }
                            maxLength={ 64 }
                            required
                            placeholder="Support agent"
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
                            { models.map((model) => (
                                <option key={ model.id } value={ model.id }>{ model.name } · { model.model }</option>
                            )) }
                        </select>
                    </label>

                    <Button type="submit" disabled={ busy } icon={ <Plus size={ 18 } aria-hidden="true" /> }>
                        { busy ? 'Creating...' : 'Create agent' }
                    </Button>
                </form>
            ) }

            { error !== null && <p className="note" data-state="error" role="alert">{ error }</p> }

            { agents === null && <p className="note">Loading agents...</p> }

            { agents !== null && agents.length === 0 && (
                <p className="note">
                    <Bot size={ 18 } aria-hidden="true" /> No agents yet.
                </p>
            ) }

            { agents !== null && agents.length > 0 && (
                <ul className="rows">
                    { agents.map((agent) => (
                        <li className="rows__item" key={ agent.id }>
                            <Link className="rows__link" to={ `/dashboard/team/${ teamId }/agent/${ agent.id }` }>
                                <span className="rows__name">{ agent.name }</span>

                                <span className="rows__meta">
                                    { agent.model_name !== '' ? agent.model_name : 'no model attached' }
                                    { ' · ' }
                                    { agent.document_count } file{ agent.document_count === 1 ? '' : 's' }
                                    { agent.description !== '' && ` · ${ agent.description }` }
                                </span>
                            </Link>
                        </li>
                    )) }
                </ul>
            ) }
        </Panel>
    );
}
