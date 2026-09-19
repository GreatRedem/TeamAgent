import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Link } from 'react-router';

import { profileName } from './profileName';
import { ApiError, conversationList, type TelegramProfile } from '../lib/api';

interface TeamProfilesProps
{
    teamId: number;
}

/**
 * The directory of people who have written to this team's bots.
 *
 * It reuses the conversation listing rather than adding a second endpoint that
 * returns the same rows; the per-person detail is what has its own route.
 */
export function TeamProfiles({ teamId }: TeamProfilesProps)
{
    const [ profiles, setProfiles ] = useState<TelegramProfile[] | null>(null);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        let active = true;

        conversationList(teamId)
            .then((payload) =>
            {
                if (active)
                {
                    setProfiles(payload.conversations);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setProfiles([ ]);
                    setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    return (
        <section className="section">
            <h2 className="section__title">Profile</h2>

            { error !== null && <p className="status" data-state="error" role="alert">{ error }</p> }

            { profiles === null && <p className="status">Loading profiles...</p> }

            { profiles !== null && profiles.length === 0 && (
                <p className="status">
                    <UserRound size={ 18 } aria-hidden="true" />
                    No profiles yet. One is created automatically the first time someone sends a bot a private message.
                </p>
            ) }

            { profiles !== null && profiles.length > 0 && (
                <ul className="list">
                    { profiles.map((profile) => (
                        <li className="list__item" key={ profile.id }>
                            <Link className="list__link" to={ `/dashboard/team/${ teamId }/profile/${ profile.id }` }>
                                <span className="list__name">{ profileName(profile) }</span>

                                <span className="list__meta">
                                    { profile.username !== '' && `@${ profile.username } · ` }
                                    { profile.message_count } message{ profile.message_count === 1 ? '' : 's' } · last { new Date(profile.last_seen_at).toLocaleString() }
                                </span>
                            </Link>
                        </li>
                    )) }
                </ul>
            ) }
        </section>
    );
}
