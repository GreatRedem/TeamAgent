import { useCallback, useEffect, useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from './Button';
import { ApiError, agentCreate, agentList, modelList, type TeamAgent, type TeamModel } from '../lib/api';

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

    return (
        <section className="section">
            <h2 className="section__title">Agent</h2>

            { models !== null && !hasModels && (
                <p className="status" data-state="error">
                    Add a model first — an agent has to be attached to one.
                </p>
            ) }

            { hasModels && (
                <form className="form" onSubmit={ add }>
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

            { error !== null && <p className="status" data-state="error" role="alert">{ error }</p> }

            { agents === null && <p className="status">Loading agents...</p> }

            { agents !== null && agents.length === 0 && (
                <p className="status">
                    <Bot size={ 18 } aria-hidden="true" /> No agents yet.
                </p>
            ) }

            { agents !== null && agents.length > 0 && (
                <ul className="list">
                    { agents.map((agent) => (
                        <li className="list__item" key={ agent.id }>
                            <Link className="list__link" to={ `/dashboard/team/${ teamId }/agent/${ agent.id }` }>
                                <span className="list__name">{ agent.name }</span>

                                <span className="list__meta">
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
        </section>
    );
}
