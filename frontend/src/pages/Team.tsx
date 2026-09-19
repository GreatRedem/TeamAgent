import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { Button, ButtonLink } from '../components/Button';
import { Tabs, type Tab } from '../components/Tabs';
import { TeamAgents } from '../components/TeamAgents';
import { TeamBots } from '../components/TeamBots';
import { TeamConversations } from '../components/TeamConversations';
import { TeamModels } from '../components/TeamModels';
import { TeamProfiles } from '../components/TeamProfiles';
import { ApiError, teamDetails, teamUpdate, type Team as TeamRecord } from '../lib/api';
import { clearAccessToken, readAccessToken } from '../lib/session';

/** Details for one team, with the same fields editable in place. */
const TABS: Tab[] = [
    { id: 'settings', label: 'Settings' },
    { id: 'telegram', label: 'Telegram' },
    { id: 'model', label: 'Model' },
    { id: 'agent', label: 'Agent' },
    { id: 'conversation', label: 'Conversation' },
    { id: 'profile', label: 'Profile' }
];

export function Team()
{
    const navigate = useNavigate();

    const { id } = useParams<{ id: string }>();

    const teamId = Number(id);

    // Derived during render instead of pushed into state from the effect, so a
    // bad url does not cost an extra render pass to show its message.
    const idInvalid = !Number.isInteger(teamId) || teamId < 1;

    const [ team, setTeam ] = useState<TeamRecord | null>(null);
    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ busy, setBusy ] = useState(false);
    const [ saved, setSaved ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ tab, setTab ] = useState(TABS[0].id);

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

    const shown = idInvalid ? 'TEAM_ID_INVALID' : error;

    return (
        <section className="panel">
            <header className="panel__head">
                <h1 className="panel__title">{ team?.name ?? 'Team' }</h1>

                <ButtonLink to="/dashboard" icon={ <ArrowLeft size={ 18 } aria-hidden="true" /> }>
                    Back
                </ButtonLink>
            </header>

            { team !== null && <Tabs tabs={ TABS } active={ tab } onChange={ setTab } /> }

            { team === null && shown === null && <p className="status">Loading team...</p> }

            { shown !== null && <p className="status" data-state="error" role="alert">{ shown }</p> }

            { team !== null && (
                <>
                    <section className="section" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" hidden={ tab !== 'settings' }>
                        <h2 className="section__title">Settings</h2>

                        <dl className="details">
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

                        { saved && <output className="status">Saved.</output> }
                    </section>

                    { /* Mounted only when selected: each section fetches on mount,
                         so rendering all five would fire every request up front. */ }
                    <div id="panel-telegram" role="tabpanel" aria-labelledby="tab-telegram" hidden={ tab !== 'telegram' }>
                        { tab === 'telegram' && <TeamBots teamId={ teamId } /> }
                    </div>

                    <div id="panel-model" role="tabpanel" aria-labelledby="tab-model" hidden={ tab !== 'model' }>
                        { tab === 'model' && <TeamModels teamId={ teamId } /> }
                    </div>

                    <div id="panel-agent" role="tabpanel" aria-labelledby="tab-agent" hidden={ tab !== 'agent' }>
                        { tab === 'agent' && <TeamAgents teamId={ teamId } /> }
                    </div>

                    <div id="panel-conversation" role="tabpanel" aria-labelledby="tab-conversation" hidden={ tab !== 'conversation' }>
                        { tab === 'conversation' && <TeamConversations teamId={ teamId } /> }
                    </div>

                    <div id="panel-profile" role="tabpanel" aria-labelledby="tab-profile" hidden={ tab !== 'profile' }>
                        { tab === 'profile' && <TeamProfiles teamId={ teamId } /> }
                    </div>
                </>
            ) }
        </section>
    );
}
