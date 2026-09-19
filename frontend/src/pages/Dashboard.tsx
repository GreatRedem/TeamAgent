import { useCallback, useEffect, useState } from 'react';
import { LogOut, Plus, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { Button } from '../components/Button';
import { ApiError, teamCreate, teamList, type Team } from '../lib/api';
import { clearAccessToken, readAccessToken } from '../lib/session';

export function Dashboard()
{
    const navigate = useNavigate();

    const [ token, setToken ] = useState<string | null>(() => readAccessToken());

    const [ teams, setTeams ] = useState<Team[] | null>(null);
    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    const signOut = useCallback(() =>
    {
        clearAccessToken();

        setToken(null);
    }, []);

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
                    signOut();

                    return;
                }

                setTeams([ ]);
                setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
            });

        return () =>
        {
            active = false;
        };
    }, [ token, signOut ]);

    const create = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setBusy(true);

        try
        {
            const team = await teamCreate(name.trim(), description.trim());

            setTeams((current) => [ team, ...current ?? [ ] ]);
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
        <section className="panel">
            <header className="panel__head">
                <h1 className="panel__title">Teams</h1>

                <Button type="button" onClick={ signOut } icon={ <LogOut size={ 18 } aria-hidden="true" /> }>
                    Sign out
                </Button>
            </header>

            <form className="form" onSubmit={ create }>
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

            { error !== null && <p className="status" data-state="error" role="alert">{ error }</p> }

            { teams === null && <p className="status">Loading teams...</p> }

            { teams !== null && teams.length === 0 && (
                <p className="status">
                    <Users size={ 18 } aria-hidden="true" /> No teams yet. Create the first one above.
                </p>
            ) }

            { teams !== null && teams.length > 0 && (
                <ul className="list">
                    { teams.map((team) => (
                        <li className="list__item" key={ team.id }>
                            <Link className="list__link" to={ `/dashboard/team/${ team.id }` }>
                                <span className="list__name">{ team.name }</span>

                                { team.description !== '' && <span className="list__meta">{ team.description }</span> }
                            </Link>
                        </li>
                    )) }
                </ul>
            ) }
        </section>
    );
}
