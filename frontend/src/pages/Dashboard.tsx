import { useCallback, useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { Button } from '../components/Button';
import { PaginationFooter } from '../components/PaginationFooter';
import { Panel, PageHead } from '../components/Panel';
import { ApiError, teamCreate, teamList, type Paged, type Team } from '../lib/api';
import { clearAccessToken, readAccessToken } from '../lib/session';

export function Dashboard()
{
    const navigate = useNavigate();

    const [ token, setToken ] = useState<string | null>(() => readAccessToken());

    const [ teams, setTeams ] = useState<Team[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    // Nothing here is a security boundary -- the backend rejects an absent or
    // invalid token on its own. This only keeps signed-out users off the view.
    useEffect(() =>
    {
        if (token === null)
        {
            void navigate('/', { replace: true });
        }
    }, [ token, navigate ]);

    useEffect(() =>
    {
        if (token === null)
        {
            return;
        }

        let active = true;

        teamList()
            .then((payload) =>
            {
                if (active)
                {
                    setTeams(payload.teams);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) =>
            {
                if (!active)
                {
                    return;
                }

                // An expired token is the common case here; drop it rather than
                // leaving the view stuck on an error it cannot recover from.
                if (cause instanceof ApiError && cause.status === 401)
                {
                    clearAccessToken();
                    setToken(null);

                    return;
                }

                setTeams([ ]);
                setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
            });

        return () =>
        {
            active = false;
        };
    }, [ token ]);

    const goTo = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await teamList({ offset });

            setTeams(next.teams);
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
    }, []);

    const create = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setBusy(true);

        try
        {
            const team = await teamCreate(name.trim(), description.trim());

            setTeams((current) => [ team, ...current ?? [ ] ]);
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
    }, [ name, description ]);

    if (token === null)
    {
        return null;
    }

    return (
        <>
            <PageHead title="Projects" sub="Every team this wallet owns" />

            <Panel title="New project" sub="A team is a set of bots, agents and models that belong together">
                <form className="form mt-0" onSubmit={ create }>
                    <label className="field">
                        <span className="field__label">Name</span>

                        <input
                            className="field__input"
                            value={ name }
                            onChange={ (event) => setName(event.target.value) }
                            minLength={ 2 }
                            maxLength={ 64 }
                            required
                            placeholder="Night shift"
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

                    <Button type="submit" disabled={ busy } icon={ <Plus size={ 18 } aria-hidden="true" /> }>
                        { busy ? 'Creating...' : 'Create team' }
                    </Button>
                </form>
            </Panel>

            <Panel
                title="Teams"
                footer={ page !== null && teams !== null && (
                    <PaginationFooter page={ page } shown={ teams.length } busy={ paging } noun="teams" onPage={ (offset) => void goTo(offset) } />
                ) }
            >
                { error !== null && <p className="note" data-state="error" role="alert">{ error }</p> }

                { teams === null && <p className="note">Loading teams...</p> }

                { teams !== null && teams.length === 0 && (
                    <p className="note">
                        <Users size={ 18 } aria-hidden="true" /> No teams yet. Create the first one above.
                    </p>
                ) }

                { teams !== null && teams.length > 0 && (
                    <ul className="rows mt-0">
                        { teams.map((team) => (
                            <li className="rows__item" key={ team.id }>
                                <Link className="rows__link" to={ `/dashboard/team/${ team.id }` }>
                                    <span className="rows__name">{ team.name }</span>

                                    { team.description !== '' && <span className="rows__meta">{ team.description }</span> }
                                </Link>
                            </li>
                        )) }
                    </ul>
                ) }
            </Panel>
        </>
    );
}
