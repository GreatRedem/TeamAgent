import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';

import { profileName } from './profileName';
import { ApiError, conversationList, conversationMessages, type TelegramMessage, type TelegramProfile } from '../lib/api';

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
    const [ selected, setSelected ] = useState<number | null>(null);
    const [ thread, setThread ] = useState<{ profile: TelegramProfile; messages: TelegramMessage[] } | null>(null);
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
                    setThread(payload);
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
        <section className="section">
            <h2 className="section__title">Conversation</h2>

            { error !== null && <p className="status" data-state="error" role="alert">{ error }</p> }

            { conversations === null && <p className="status">Loading conversations...</p> }

            { conversations !== null && conversations.length === 0 && (
                <p className="status">
                    <MessagesSquare size={ 18 } aria-hidden="true" />
                    Nobody has messaged your bots yet. A profile appears here the first time someone sends one a private message.
                </p>
            ) }

            { conversations !== null && conversations.length > 0 && (
                <ul className="list">
                    { conversations.map((profile) => (
                        <li className="list__item" key={ profile.id }>
                            <button
                                className="thread"
                                type="button"
                                aria-expanded={ selected === profile.id }
                                aria-label={ `Conversation with ${ profileName(profile) }` }
                                onClick={ () => toggle(profile.id) }
                            >
                                <span className="list__text">
                                    <span className="list__name">{ profileName(profile) }</span>

                                    <span className="list__meta">
                                        { profile.username !== '' && `@${ profile.username } · ` }
                                        { profile.message_count } message{ profile.message_count === 1 ? '' : 's' } · last { new Date(profile.last_seen_at).toLocaleString() }
                                    </span>
                                </span>
                            </button>

                            { selected === profile.id && (
                                <div className="thread__body">
                                    { openThread === null && <p className="status">Loading messages...</p> }

                                    { openThread !== null && openThread.messages.length === 0 && <p className="status">No messages stored yet.</p> }

                                    { openThread !== null && openThread.messages.map((message) => (
                                        <p className="bubble" key={ message.id }>
                                            <span className="bubble__text">{ message.text }</span>
                                            <time className="bubble__time" dateTime={ message.sent_at }>{ new Date(message.sent_at).toLocaleString() }</time>
                                        </p>
                                    )) }
                                </div>
                            ) }
                        </li>
                    )) }
                </ul>
            ) }
        </section>
    );
}
