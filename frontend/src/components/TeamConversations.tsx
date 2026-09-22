import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';

import { profileName } from './profileName';
import { ApiError, conversationList, conversationMessages, type Paged, type TelegramMessage, type TelegramProfile } from '../lib/api';
import { PaginationFooter } from './PaginationFooter';
import { Panel } from './Panel';

interface TeamConversationsProps
{
    teamId: number;
}

/**
 * Everyone who has sent the team's bots a private message, and the thread for
 * whichever of them is selected.
 */
export function TeamConversations({ teamId }: TeamConversationsProps)
{
    const [ conversations, setConversations ] = useState<TelegramProfile[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ selected, setSelected ] = useState<number | null>(null);
    const [ thread, setThread ] = useState<{ profile: TelegramProfile; messages: TelegramMessage[]; page: Paged } | null>(null);
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
                    setConversations(payload.conversations);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setConversations([ ]);
                    setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    // The newest page of whichever thread is open.
    useEffect(() =>
    {
        if (selected === null)
        {
            return;
        }

        let active = true;

        conversationMessages(teamId, selected)
            .then((payload) =>
            {
                if (active)
                {
                    setThread({ profile: payload.profile, messages: payload.messages, page: payload });
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId, selected ]);

    const goTo = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await conversationList(teamId, { offset });

            setConversations(next.conversations);
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

    /**
     * Another page of the open thread. Offset 0 is the newest page and a higher
     * offset walks into the past, so "next" here means older.
     */
    const goToMessages = useCallback(async(profileId: number, offset: number) =>
    {
        setPaging(true);

        try
        {
            const payload = await conversationMessages(teamId, profileId, { offset });

            setThread({ profile: payload.profile, messages: payload.messages, page: payload });
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

    // Derived rather than cleared from the effect: a thread left over from the
    // previously opened profile simply stops matching, so the new one reads as
    // loading without an extra render pass to blank it.
    const openThread = thread !== null && thread.profile.id === selected ? thread : null;

    const toggle = useCallback((profileId: number) =>
    {
        setError(null);
        setSelected((current) => current === profileId ? null : profileId);
    }, []);

    return (
        <Panel
            title="Conversations"
            sub="Threads with the people who have written to this team"
            footer={ page !== null && conversations !== null && (
                <PaginationFooter page={ page } shown={ conversations.length } busy={ paging } noun="conversations" onPage={ (offset) => void goTo(offset) } />
            ) }
        >
            { error !== null && <p className="note" data-state="error" role="alert">{ error }</p> }

            { conversations === null && <p className="note">Loading conversations...</p> }

            { conversations !== null && conversations.length === 0 && (
                <p className="note">
                    <MessagesSquare size={ 18 } aria-hidden="true" />
                    Nobody has messaged your bots yet. A profile appears here the first time someone sends one a private message.
                </p>
            ) }

            { conversations !== null && conversations.length > 0 && (
                <ul className="rows mt-0">
                    { conversations.map((profile) => (
                        <li className="rows__item" key={ profile.id }>
                            <button
                                className="thread"
                                type="button"
                                aria-expanded={ selected === profile.id }
                                aria-label={ `Conversation with ${ profileName(profile) }` }
                                onClick={ () => toggle(profile.id) }
                            >
                                <span className="rows__text">
                                    <span className="rows__name">{ profileName(profile) }</span>

                                    <span className="rows__meta">
                                        { profile.username !== '' && `@${ profile.username } · ` }
                                        { profile.message_count } message{ profile.message_count === 1 ? '' : 's' } · last { new Date(profile.last_seen_at).toLocaleString() }
                                    </span>
                                </span>
                            </button>

                            { selected === profile.id && (
                                <div className="thread__body">
                                    { openThread === null && <p className="note">Loading messages...</p> }

                                    { openThread !== null && openThread.messages.length === 0 && <p className="note">No messages stored yet.</p> }

                                    { openThread !== null && openThread.messages.map((message) => (
                                        <p className="bubble" data-direction={ message.direction } key={ message.id }>
                                            <span className="bubble__text">{ message.text }</span>
                                            <time className="bubble__time" dateTime={ message.sent_at }>{ new Date(message.sent_at).toLocaleString() }</time>
                                        </p>
                                    )) }

                                    { openThread !== null && (
                                        <PaginationFooter
                                            page={ openThread.page }
                                            shown={ openThread.messages.length }
                                            busy={ paging }
                                            noun="messages"
                                            onPage={ (offset) => void goToMessages(profile.id, offset) }
                                        />
                                    ) }
                                </div>
                            ) }
                        </li>
                    )) }
                </ul>
            ) }
        </Panel>
    );
}
