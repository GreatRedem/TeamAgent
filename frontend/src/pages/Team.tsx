import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { Button } from '../components/Button';
import { Panel, PageHead } from '../components/Panel';
import { TeamActivity } from '../components/TeamActivity';
import { TeamAgents } from '../components/TeamAgents';
import { TeamBots } from '../components/TeamBots';
import { TeamConversations } from '../components/TeamConversations';
import { TeamModels } from '../components/TeamModels';
import { TeamOverview } from '../components/TeamOverview';
import { TeamProfiles } from '../components/TeamProfiles';
import { ApiError, teamDetails, teamUpdate, type Team as TeamRecord } from '../lib/api';
import { clearAccessToken, readAccessToken } from '../lib/session';

/**
 * The screens a project has, keyed by the url segment after the team id. The
 * five in the rail plus Settings, which is reached from the project switcher.
 * `overview` is accepted as a spelling of the bare path.
 */
const TITLES: Record<string, string> = {
    '': 'Overview',
    overview: 'Overview',
    agents: 'Agents',
    bots: 'Bots',
    models: 'Models',
    activity: 'Activity',
    settings: 'Settings'
};

/** One project: which screen of it is decided by the url, not by state. */
export function Team()
{
    const navigate = useNavigate();

    const { id, tab = '' } = useParams<{ id: string; tab?: string }>();

    const teamId = Number(id);

    // Derived during render instead of pushed into state from the effect, so a
    // bad url does not cost an extra render pass to show its message.
    const idInvalid = !Number.isInteger(teamId) || teamId < 1;
    const title = TITLES[tab];

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

    const shown = idInvalid ? 'TEAM_ID_INVALID' : title === undefined ? 'PAGE_NOT_FOUND' : error;

    return (
        <>
            { /* Activity draws its own head: the failures filter lives in it. */ }
            { (tab !== 'activity' || team === null) && (
                <PageHead
                    title={ title ?? 'Team' }
                    sub={ team === null ? undefined : team.description === '' ? team.name : `${ team.name } · ${ team.description }` }
                />
            ) }

            { team === null && shown === null && <p className="note">Loading team...</p> }

            { shown !== null && <p className="note" data-state="error" role="alert">{ shown }</p> }

            { team !== null && title !== undefined && (
                <>
                    { (tab === '' || tab === 'overview') && <TeamOverview teamId={ teamId } /> }

                    { tab === 'agents' && <TeamAgents teamId={ teamId } /> }

                    { /* The people who write to the bots and their threads live
                         under Bots: a conversation is a thing a bot has. */ }
                    { tab === 'bots' && (
                        <>
                            <TeamBots teamId={ teamId } />
                            <TeamConversations teamId={ teamId } />
                            <TeamProfiles teamId={ teamId } />
                        </>
                    ) }

                    { tab === 'models' && <TeamModels teamId={ teamId } /> }

                    { tab === 'activity' && <TeamActivity teamId={ teamId } /> }

                    { tab === 'settings' && (
                        <Panel title="Settings" sub="The name and description this team is known by">
                            <dl className="details mt-0">
                                <div className="details__row">
                                    <dt className="details__key">Created</dt>
                                    <dd className="details__value">{ new Date(team.created_at).toLocaleString() }</dd>
                                </div>

                                <div className="details__row">
                                    <dt className="details__key">Updated</dt>
                                    <dd className="details__value">{ new Date(team.updated_at).toLocaleString() }</dd>
                                </div>
                            </dl>

                            <form className="form" onSubmit={ save }>
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

                                <Button type="submit" disabled={ busy } icon={ <Save size={ 18 } aria-hidden="true" /> }>
                                    { busy ? 'Saving...' : 'Save changes' }
                                </Button>
                            </form>

                            { saved && <output className="note">Saved.</output> }
                        </Panel>
                    ) }
                </>
            ) }
        </>
    );
}
