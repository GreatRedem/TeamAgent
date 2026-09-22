import { useCallback, useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Link } from 'react-router';

import { profileName } from './profileName';
import { ApiError, conversationList, type Paged, type TelegramProfile } from '../lib/api';
import { PaginationFooter } from './PaginationFooter';
import { Panel } from './Panel';

interface TeamProfilesProps
{
    teamId: number;
}

/**
 * The directory of people who have written to this team's bots.
 *
 * It reuses the conversation listing rather than adding a second endpoint that
 * returns the same rows; the per-person detail is what has its own route.
 *
 * ponytail: sits under Bots beside TeamConversations, which fetches the same
 * first page. One extra request per visit; fold the two into one list when
 * the thread view gets its own screen.
 */
export function TeamProfiles({ teamId }: TeamProfilesProps)
{
    const [ profiles, setProfiles ] = useState<TelegramProfile[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
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
                    setPage(payload);
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

    const goTo = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await conversationList(teamId, { offset });

            setProfiles(next.conversations);
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
            title="People"
            sub="Everyone this team knows, newest first"
            footer={ page !== null && profiles !== null && (
                <PaginationFooter page={ page } shown={ profiles.length } busy={ paging } noun="people" onPage={ (offset) => void goTo(offset) } />
            ) }
        >
            { error !== null && <p className="note" data-state="error" role="alert">{ error }</p> }

            { profiles === null && <p className="note">Loading profiles...</p> }

            { profiles !== null && profiles.length === 0 && (
                <p className="note">
                    <UserRound size={ 18 } aria-hidden="true" />
                    No profiles yet. One is created automatically the first time someone sends a bot a private message.
                </p>
            ) }

            { profiles !== null && profiles.length > 0 && (
                <ul className="rows mt-0">
                    { profiles.map((profile) => (
                        <li className="rows__item" key={ profile.id }>
                            <Link className="rows__link" to={ `/dashboard/team/${ teamId }/profile/${ profile.id }` }>
                                <span className="rows__name">{ profileName(profile) }</span>

                                <span className="rows__meta">
                                    { profile.username !== '' && `@${ profile.username } · ` }
                                    { profile.message_count } message{ profile.message_count === 1 ? '' : 's' } · last { new Date(profile.last_seen_at).toLocaleString() }
                                </span>
                            </Link>
                        </li>
                    )) }
                </ul>
            ) }
        </Panel>
    );
}
