import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router';

import { ApiError, teamDetails, teamUpdate, type Team as TeamRecord } from '../api';
import {
    CLASS_DETAILS,
    CLASS_DETAILS_KEY,
    CLASS_DETAILS_ROW,
    CLASS_DETAILS_VALUE,
    CLASS_FIELD,
    CLASS_FIELD_INPUT,
    CLASS_FIELD_LABEL,
    CLASS_FORM,
    CLASS_NOTE,
    CLASS_NOTE_ERROR,
    TEAM_TITLES
} from '../lib/constant';
import { teamPath } from '../lib/navigation';
import { clearAccessToken, readAccessToken } from '../lib/session';
import { TeamAgents } from '../components/TeamAgents';
import { TeamBots } from '../components/TeamBots';
import { TeamConversations } from '../components/TeamConversations';
import { TeamModels } from '../components/TeamModels';
import { TeamOverview } from '../components/TeamOverview';
import { TeamProfiles } from '../components/TeamProfiles';
import { Button } from '../components/ui/Button';
import { Panel, PageHead } from '../components/ui/Panel';

export function Team()
{
    const navigate = useNavigate();

    const { id, tab = '' } = useParams<{ id: string; tab?: string }>();

    const teamId = Number(id);

    const idInvalid = !Number.isInteger(teamId) || teamId < 1;
    const title = TEAM_TITLES[tab];

    const [ team, setTeam ] = useState<TeamRecord | null>(null);
    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ saved, setSaved ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        if (readAccessToken() === null)
        {
            void navigate('/', { replace: true });

            return;
        }

        if (idInvalid)
        {
            return;
        }

        let active = true;

        teamDetails(teamId)
            .then((payload) =>
            {
                if (!active)
                {
                    return;
                }

                setTeam(payload);
                setName(payload.name);
                setDescription(payload.description);
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
    }, [ teamId, idInvalid, navigate ]);

    const save = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setSaved(false);
        setBusy(true);

        try
        {
            const updated = await teamUpdate(teamId, name.trim(), description.trim());

            setTeam(updated);
            setName(updated.name);
            setDescription(updated.description);
            setSaved(true);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setBusy(false);
        }
    }, [ teamId, name, description ]);

    if (!idInvalid && tab === 'activity')
    {
        return <Navigate to={ teamPath(teamId) } replace />;
    }

    const shown = idInvalid ? 'TEAM_ID_INVALID' : title === undefined ? 'PAGE_NOT_FOUND' : error;

    return (
        <>
            <PageHead
                title={ title ?? 'Team' }
                sub={ team === null ? undefined : team.description === '' ? team.name : `${ team.name } · ${ team.description }` }
            />

            { team === null && shown === null && <p className={ CLASS_NOTE }>Loading team...</p> }

            { shown !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ shown }</p> }

            { team !== null && title !== undefined && (
                <>
                    { (tab === '' || tab === 'overview') && <TeamOverview teamId={ teamId } /> }

                    { tab === 'agents' && <TeamAgents teamId={ teamId } /> }

                    { tab === 'bots' && (
                        <>
                            <TeamBots teamId={ teamId } />
                            <TeamConversations teamId={ teamId } />
                            <TeamProfiles teamId={ teamId } />
                        </>
                    ) }

                    { tab === 'models' && <TeamModels teamId={ teamId } /> }

                    { tab === 'settings' && (
                        <Panel title="Settings" sub="The name and description this team is known by">
                            <dl className={ CLASS_DETAILS }>
                                <div className={ CLASS_DETAILS_ROW }>
                                    <dt className={ CLASS_DETAILS_KEY }>Created</dt>
                                    <dd className={ CLASS_DETAILS_VALUE }>{ new Date(team.created_at).toLocaleString() }</dd>
                                </div>

                                <div className={ CLASS_DETAILS_ROW }>
                                    <dt className={ CLASS_DETAILS_KEY }>Updated</dt>
                                    <dd className={ CLASS_DETAILS_VALUE }>{ new Date(team.updated_at).toLocaleString() }</dd>
                                </div>
                            </dl>

                            <form className={ `mt-6 ${ CLASS_FORM }` } onSubmit={ save }>
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

                                <Button type="submit" disabled={ busy } icon={ <Save size={ 18 } aria-hidden="true" /> }>
                                    { busy ? 'Saving...' : 'Save changes' }
                                </Button>
                            </form>

                            { saved && <output className={ `mt-3.5 ${ CLASS_NOTE }` }>Saved.</output> }
                        </Panel>
                    ) }
                </>
            ) }
        </>
    );
}
