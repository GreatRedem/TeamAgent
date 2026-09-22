import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from 'cn';

import { ApiError, conversationList, conversationMessages, type Paged, type TelegramMessage, type TelegramProfile } from '@/api';
import { profileName } from '@/lib/profileName';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { Skeleton } from '@/components/ui/skeleton';

export function PeoplePanel({ teamId }: { teamId: number })
{
    const [ people, setPeople ] = useState<TelegramProfile[] | null>(null);
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
                    setPeople(payload.conversations);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setPeople([ ]);
                    setError(cause instanceof ApiError ? cause.result : 'The people could not be loaded.');
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
                    setError(cause instanceof ApiError ? cause.result : 'The thread could not be loaded.');
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

            setPeople(next.conversations);
            setPage(next);
            setSelected(null);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The people could not be loaded.');
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
            setError(cause instanceof ApiError ? cause.result : 'The thread could not be loaded.');
        }
        finally
        {
            setPaging(false);
        }
    }, [ teamId ]);

    const openThread = thread !== null && thread.profile.id === selected ? thread : null;

    return (
        <Card className="gap-0 py-0">
            <CardHeader className="border-b py-5">
                <CardTitle>People</CardTitle>
                <CardDescription>Everyone who has messaged a bot in this project, most recent first.</CardDescription>
            </CardHeader>

            <CardContent className="px-0 py-5">
                { error !== null && (
                    <div className="px-5">
                        <Alert variant="destructive"><AlertDescription>{ error }</AlertDescription></Alert>
                    </div>
                ) }

                { people === null && (
                    <div className="grid gap-2 px-5">
                        { [ 0, 1, 2 ].map((i) => <Skeleton className="h-12" key={ i } />) }
                    </div>
                ) }

                { people !== null && people.length === 0 && (
                    <div className="px-5">
                        <EmptyState
                            icon={ UserRound }
                            title="Nobody has written yet"
                            description="Someone appears here the first time they send one of your bots a private message."
                        />
                    </div>
                ) }

                { people !== null && people.length > 0 && (
                    <ul className="m-0 grid list-none p-0">
                        { people.map((profile) =>
                        {
                            const open = selected === profile.id;

                            return (
                                <li className="border-b last:border-b-0" key={ profile.id }>
                                    <button
                                        type="button"
                                        className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-5 py-3 text-start hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                                        aria-expanded={ open }
                                        onClick={ () => setSelected(open ? null : profile.id) }
                                    >
                                        <span className="grid min-w-0 gap-0.5">
                                            <span className="truncate font-medium">{ profileName(profile) }</span>

                                            <span className="truncate text-sm text-muted-foreground">
                                                { profile.username !== '' && <span className="font-mono text-2xs">@{ profile.username }</span> }
                                                { profile.username !== '' && ', ' }
                                                { profile.message_count } message{ profile.message_count === 1 ? '' : 's' }
                                            </span>
                                        </span>

                                        <span className="grow" />

                                        <time className="hidden shrink-0 font-mono text-2xs text-muted-foreground sm:block" dateTime={ profile.last_seen_at }>
                                            { new Date(profile.last_seen_at).toLocaleDateString() }
                                        </time>

                                        <ChevronDown
                                            size={ 16 }
                                            className={ cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180') }
                                            aria-hidden="true"
                                        />
                                    </button>

                                    { open && (
                                        <div className="grid gap-3 bg-muted/30 px-5 py-4">
                                            { openThread === null && <Skeleton className="h-16" /> }

                                            { openThread !== null && openThread.messages.length === 0 && (
                                                <p className="m-0 text-sm text-muted-foreground">No messages stored for this person yet.</p>
                                            ) }

                                            { openThread?.messages.map((message) => (
                                                <div
                                                    key={ message.id }
                                                    className={ cn(
                                                        'grid max-w-[46ch] gap-1 rounded-lg border px-3 py-2',
                                                        message.direction === 'out'
                                                            ? 'justify-self-end border-primary/30 bg-primary/10'
                                                            : 'justify-self-start bg-card'
                                                    ) }
                                                >
                                                    <p className="m-0 text-sm whitespace-pre-wrap break-anywhere">{ message.text }</p>
                                                    <time className="font-mono text-2xs text-muted-foreground" dateTime={ message.sent_at }>
                                                        { new Date(message.sent_at).toLocaleString() }
                                                    </time>
                                                </div>
                                            )) }

                                            <div className="flex flex-wrap items-center justify-between gap-3">
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

                                            <Button asChild variant="outline" size="sm" className="justify-self-start">
                                                <Link to={ `/dashboard/team/${ teamId }/profile/${ profile.id }` }>Open full profile</Link>
                                            </Button>
                                        </div>
                                    ) }
                                </li>
                            );
                        }) }
                    </ul>
                ) }
            </CardContent>

            { page !== null && people !== null && people.length > 0 && (
                <CardFooter className="border-t py-4">
                    <PaginationFooter page={ page } shown={ people.length } busy={ paging } noun="people" onPage={ (offset) => void goTo(offset) } />
                </CardFooter>
            ) }
        </Card>
    );
}
