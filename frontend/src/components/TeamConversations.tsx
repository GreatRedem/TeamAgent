import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';

import { profileName } from '../lib/profileName';
import { ApiError, conversationList, conversationMessages, type Paged, type TelegramMessage, type TelegramProfile } from '../api';
import { PaginationFooter } from './ui/PaginationFooter';
import { Panel } from './ui/Panel';

import {
    CLASS_BUBBLE_IN,
    CLASS_BUBBLE_OUT,
    CLASS_BUBBLE_TEXT,
    CLASS_BUBBLE_TIME,
    CLASS_NOTE,
    CLASS_NOTE_ERROR,
    CLASS_ROWS,
    CLASS_ROW_META,
    CLASS_ROW_NAME,
    CLASS_ROW_TEXT,
    CLASS_THREAD,
    CLASS_THREAD_BODY
} from '../lib/constant';

interface TeamConversationsProps
{
    teamId: number;
}

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
            { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

            { conversations === null && <p className={ CLASS_NOTE }>Loading conversations...</p> }

            { conversations !== null && conversations.length === 0 && (
                <p className={ CLASS_NOTE }>
                    <MessagesSquare size={ 18 } aria-hidden="true" />
                    Nobody has messaged your bots yet. A profile appears here the first time someone sends one a private message.
                </p>
            ) }

            { conversations !== null && conversations.length > 0 && (
                <ul className={ CLASS_ROWS }>
                    { conversations.map((profile) => (
                        <li key={ profile.id }>
                            <button
                                className={ CLASS_THREAD }
                                type="button"
                                aria-expanded={ selected === profile.id }
                                aria-label={ `Conversation with ${ profileName(profile) }` }
                                onClick={ () => toggle(profile.id) }
                            >
                                <span className={ CLASS_ROW_TEXT }>
                                    <span className={ CLASS_ROW_NAME }>{ profileName(profile) }</span>

                                    <span className={ CLASS_ROW_META }>
                                        { profile.username !== '' && `@${ profile.username } · ` }
                                        { profile.message_count } message{ profile.message_count === 1 ? '' : 's' } · last { new Date(profile.last_seen_at).toLocaleString() }
                                    </span>
                                </span>
                            </button>

                            { selected === profile.id && (
                                <div className={ CLASS_THREAD_BODY }>
                                    { openThread === null && <p className={ CLASS_NOTE }>Loading messages...</p> }

                                    { openThread !== null && openThread.messages.length === 0 && <p className={ CLASS_NOTE }>No messages stored yet.</p> }

                                    { openThread !== null && openThread.messages.map((message) => (
                                        <p className={ message.direction === 'out' ? CLASS_BUBBLE_OUT : CLASS_BUBBLE_IN } key={ message.id }>
                                            <span className={ CLASS_BUBBLE_TEXT }>{ message.text }</span>
                                            <time className={ CLASS_BUBBLE_TIME } dateTime={ message.sent_at }>{ new Date(message.sent_at).toLocaleString() }</time>
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
