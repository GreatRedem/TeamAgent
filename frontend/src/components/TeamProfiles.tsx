import { useCallback, useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Link } from 'react-router';

import { profileName } from '../lib/profileName';
import { ApiError, conversationList, type Paged, type TelegramProfile } from '../api';
import { PaginationFooter } from './ui/PaginationFooter';
import { Panel } from './ui/Panel';

import {
    CLASS_NOTE,
    CLASS_NOTE_ERROR,
    CLASS_ROWS,
    CLASS_ROW_LINK,
    CLASS_ROW_META,
    CLASS_ROW_NAME
} from '../lib/constant';

interface TeamProfilesProps
{
    teamId: number;
}

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
            { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

            { profiles === null && <p className={ CLASS_NOTE }>Loading profiles...</p> }

            { profiles !== null && profiles.length === 0 && (
                <p className={ CLASS_NOTE }>
                    <UserRound size={ 18 } aria-hidden="true" />
                    No profiles yet. One is created automatically the first time someone sends a bot a private message.
                </p>
            ) }

            { profiles !== null && profiles.length > 0 && (
                <ul className={ CLASS_ROWS }>
                    { profiles.map((profile) => (
                        <li key={ profile.id }>
                            <Link className={ CLASS_ROW_LINK } to={ `/dashboard/team/${ teamId }/profile/${ profile.id }` }>
                                <span className={ CLASS_ROW_NAME }>{ profileName(profile) }</span>

                                <span className={ CLASS_ROW_META }>
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
