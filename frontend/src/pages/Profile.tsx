import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { ButtonLink } from '../components/Button';
import { profileName } from '../components/profileName';
import { ApiError, profileDetails, type TelegramMessage, type TelegramProfile, type TelegramProfileBot } from '../lib/api';
import { clearAccessToken, readAccessToken } from '../lib/session';

interface Details
{
    profile: TelegramProfile;
    bots: TelegramProfileBot[];
    messages: TelegramMessage[];
}

/** A row in the identity table, skipped entirely when Telegram gave us nothing. */
function Field({ label, value }: { label: string; value: string })
{
    if (value === '')
    {
        return null;
    }

    return (
        <div className="details__row">
            <dt className="details__key">{ label }</dt>
            <dd className="details__value">{ value }</dd>
        </div>
    );
}

/**
 * Everything held about one person who has messaged the team's bots: the fields
 * Telegram supplies, which bots they have written to, and their full history.
 */
export function Profile()
{
    const navigate = useNavigate();

    const { id, profileId } = useParams<{ id: string; profileId: string }>();

    const teamId = Number(id);
    const personId = Number(profileId);

    const idsInvalid = !Number.isInteger(teamId) || teamId < 1 || !Number.isInteger(personId) || personId < 1;

    const [ details, setDetails ] = useState<Details | null>(null);
    const [ error, setError ] = useState<string | null>(null);

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

        profileDetails(teamId, personId)
            .then((payload) =>
            {
                if (active)
                {
                    setDetails(payload);
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

                    void navigate('/', { replace: true });

                    return;
                }

                setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId, personId, idsInvalid, navigate ]);

    const shown = idsInvalid ? 'PROFILE_ID_INVALID' : error;

    // Message rows carry a bot id; the header knows the names.
    const botNames = new Map((details?.bots ?? [ ]).map((bot) => [ bot.id, bot.name ]));

    return (
        <section className="panel">
            <header className="panel__head">
                <h1 className="panel__title">{ details !== null ? profileName(details.profile) : 'Profile' }</h1>

                <ButtonLink to={ `/dashboard/team/${ teamId }` } icon={ <ArrowLeft size={ 18 } aria-hidden="true" /> }>
                    Back
                </ButtonLink>
            </header>

            { details === null && shown === null && <p className="status">Loading profile...</p> }

            { shown !== null && <p className="status" data-state="error" role="alert">{ shown }</p> }

            { details !== null && (
                <>
                    <section className="section">
                        <h2 className="section__title">Identity</h2>

                        <dl className="details">
                            <Field label="Telegram ID" value={ details.profile.telegram_id } />
                            <Field label="Username" value={ details.profile.username !== '' ? `@${ details.profile.username }` : '' } />
                            <Field label="First name" value={ details.profile.first_name } />
                            <Field label="Last name" value={ details.profile.last_name } />
                            <Field label="Language" value={ details.profile.language_code } />
                            <Field label="Messages" value={ String(details.profile.message_count) } />
                            <Field label="First seen" value={ new Date(details.profile.created_at).toLocaleString() } />
                            <Field label="Last seen" value={ new Date(details.profile.last_seen_at).toLocaleString() } />
                        </dl>
                    </section>

                    <section className="section">
                        <h2 className="section__title">Bots</h2>

                        { details.bots.length === 0 && <p className="status">No stored messages to attribute.</p> }

                        { details.bots.length > 0 && (
                            <ul className="list">
                                { details.bots.map((bot) => (
                                    <li className="list__item list__item--row" key={ bot.id }>
                                        <span className="list__text">
                                            <span className="list__name">{ bot.name }</span>
                                            <span className="list__meta">last { new Date(bot.last_seen_at).toLocaleString() }</span>
                                        </span>

                                        <span className="list__meta">{ bot.message_count } message{ bot.message_count === 1 ? '' : 's' }</span>
                                    </li>
                                )) }
                            </ul>
                        ) }
                    </section>

                    <section className="section">
                        <h2 className="section__title">Conversations</h2>

                        { details.messages.length === 0 && <p className="status">No messages stored yet.</p> }

                        { details.messages.length > 0 && (
                            <div className="thread__body thread__body--plain">
                                { details.messages.map((message) => (
                                    <p className="bubble" key={ message.id }>
                                        <span className="bubble__text">{ message.text }</span>

                                        <time className="bubble__time" dateTime={ message.sent_at }>
                                            { botNames.get(message.bot_id) ?? 'Removed bot' } · { new Date(message.sent_at).toLocaleString() }
                                        </time>
                                    </p>
                                )) }
                            </div>
                        ) }
                    </section>
                </>
            ) }
        </section>
    );
}
