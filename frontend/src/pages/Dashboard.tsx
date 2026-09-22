import { useCallback, useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { ApiError, teamCreate, teamList, type Paged, type Team } from '../api';
import {
    CLASS_CARD_GRID,
    CLASS_CARD_LINK,
    CLASS_CARD_META,
    CLASS_CARD_NAME,
    CLASS_CARD_BODY,
    CLASS_FIELD,
    CLASS_FIELD_INPUT,
    CLASS_FIELD_LABEL,
    CLASS_FORM,
    CLASS_NOTE,
    CLASS_NOTE_ERROR
} from '../lib/constant';
import { clearAccessToken, readAccessToken } from '../lib/session';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PaginationFooter } from '../components/ui/PaginationFooter';
import { Panel, PageHead } from '../components/ui/Panel';

export function Dashboard()
{
    const navigate = useNavigate();

    const [ token, setToken ] = useState<string | null>(() => readAccessToken());

    const [ teams, setTeams ] = useState<Team[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ creating, setCreating ] = useState(false);
    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

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
    }, [ name, description ]);

    if (token === null)
    {
        return null;
    }

    return (
        <>
            <PageHead
                title="Projects"
                sub="Every team this wallet owns"
                actions={ (
                    <Button type="button" icon={ <Plus size={ 18 } aria-hidden="true" /> } onClick={ () => setCreating(true) }>
                        Create project
                    </Button>
                ) }
            />

            <Modal
                open={ creating }
                title="New project"
                sub="A team is a set of bots, agents and models that belong together"
                onClose={ () => setCreating(false) }
            >
                <form className={ CLASS_FORM } onSubmit={ create }>
                    <label className={ CLASS_FIELD }>
                        <span className={ CLASS_FIELD_LABEL }>Name</span>

                        <input
                            className={ CLASS_FIELD_INPUT }
                            value={ name }
                            onChange={ (event) => setName(event.target.value) }
                            minLength={ 2 }
                            maxLength={ 64 }
                            required
                            placeholder="Night shift"
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

                    { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

                    <Button type="submit" disabled={ busy } icon={ <Plus size={ 18 } aria-hidden="true" /> }>
                        { busy ? 'Creating...' : 'Create project' }
                    </Button>
                </form>
            </Modal>

            <Panel
                title="Teams"
                footer={ page !== null && teams !== null && (
                    <PaginationFooter page={ page } shown={ teams.length } busy={ paging } noun="teams" onPage={ (offset) => void goTo(offset) } />
                ) }
            >
                { error !== null && !creating && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

                { teams === null && <p className={ CLASS_NOTE }>Loading teams...</p> }

                { teams !== null && teams.length === 0 && (
                    <p className={ CLASS_NOTE }>
                        <Users size={ 18 } aria-hidden="true" /> No teams yet. Create the first one with the button above.
                    </p>
                ) }

                { teams !== null && teams.length > 0 && (
                    <ul className={ CLASS_CARD_GRID }>
                        { teams.map((team) => (
                            <li key={ team.id }>
                                <Link className={ CLASS_CARD_LINK } to={ `/dashboard/team/${ team.id }` }>
                                    <span className={ CLASS_CARD_NAME }>{ team.name }</span>

                                    <span className={ CLASS_CARD_BODY }>
                                        { team.description === '' ? 'No description' : team.description }
                                    </span>

                                    <span className={ `${ CLASS_CARD_META } mt-auto` }>
                                        TEAM { team.id } · { new Date(team.created_at).toLocaleDateString() }
                                    </span>
                                </Link>
                            </li>
                        )) }
                    </ul>
                ) }
            </Panel>
        </>
    );
}
