import { ArrowUpRight, ChevronDown, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    conversationList,
    conversationMessages,
    type Paged,
    type TelegramMessage,
    type TelegramProfile,
} from '@/apis';
import { EmptyState } from '@/components/empty-state';
import { Pager } from '@/components/pager';
import { cn } from '@/libs/cn';
import { dateLabel, dateTimeLabel } from '@/libs/format';
import { apiError, t, tn } from '@/libs/i18n';
import { profileName } from '@/libs/profileName';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { Pressable } from '@/ui/pressable';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function PeoplePanel({ teamId }: { teamId: number }) {
    const [people, setPeople] = useState<TelegramProfile[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [thread, setThread] = useState<{
        profile: TelegramProfile;
        messages: TelegramMessage[];
        page: Paged;
    } | null>(null);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        conversationList(teamId)
            .then((payload) => {
                if (active) {
                    setPeople(payload.conversations);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setPeople([]);
                    setError(apiError(cause, 'people.errors.loadFailed'));
                }
            });

        return () => {
            active = false;
        };
    }, [teamId]);

    useEffect(() => {
        if (selected === null) {
            return;
        }

        let active = true;

        conversationMessages(teamId, selected)
            .then((payload) => {
                if (active) {
                    setThread({
                        profile: payload.profile,
                        messages: payload.messages,
                        page: payload,
                    });
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setError(apiError(cause, 'people.errors.threadFailed'));
                }
            });

        return () => {
            active = false;
        };
    }, [teamId, selected]);

    const goTo = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await conversationList(teamId, { offset });

                setPeople(next.conversations);
                setPage(next);
                setSelected(null);
            } catch (cause) {
                setError(apiError(cause, 'people.errors.loadFailed'));
            } finally {
                setPaging(false);
            }
        },
        [teamId],
    );

    const goToMessages = useCallback(
        async (profileId: number, offset: number) => {
            setPaging(true);

            try {
                const payload = await conversationMessages(teamId, profileId, { offset });

                setThread({ profile: payload.profile, messages: payload.messages, page: payload });
            } catch (cause) {
                setError(apiError(cause, 'people.errors.threadFailed'));
            } finally {
                setPaging(false);
            }
        },
        [teamId],
    );

    const openThread = thread !== null && thread.profile.id === selected ? thread : null;

    return (
        <Card gap={0} flush>
            <CardHeader className="border-b py-5">
                <CardTitle>{t('people.list.title')}</CardTitle>
                <CardDescription>{t('people.list.description')}</CardDescription>
            </CardHeader>

            <CardContent padding="none" className="py-5">
                {error !== null && (
                    <Stack direction="Vertical" className="px-5">
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    </Stack>
                )}

                {people === null && (
                    <Stack direction="Vertical" className="gap-2 px-5">
                        {[0, 1, 2].map((i) => (
                            <Skeleton className="h-12" key={i} />
                        ))}
                    </Stack>
                )}

                {people !== null && people.length === 0 && (
                    <Stack direction="Vertical" className="px-5">
                        <EmptyState
                            icon={UserRound}
                            title={t('people.list.emptyTitle')}
                            description={t('people.list.emptyDescription')}
                        />
                    </Stack>
                )}

                {people !== null && people.length > 0 && (
                    <Stack direction="Vertical" as="ul" className="m-0 list-none p-0">
                        {people.map((profile) => {
                            const open = selected === profile.id;

                            return (
                                <Stack
                                    direction="Vertical"
                                    as="li"
                                    className="border-b last:border-b-0"
                                    key={profile.id}>
                                    <Stack
                                        direction="Horizontal"
                                        className="relative items-center gap-3 px-5 py-3 hover:bg-accent/40">
                                        <Pressable
                                            className="min-w-0 grow border-0 bg-transparent p-0 outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                                            onClick={() => setSelected(open ? null : profile.id)}>
                                            <Stack
                                                direction="Vertical"
                                                as="span"
                                                className="min-w-0 gap-0.5">
                                                <Text
                                                    type="Strong"
                                                    as="span"
                                                    className="truncate"
                                                    message={profileName(profile)}
                                                />

                                                <Stack
                                                    direction="Horizontal"
                                                    as="span"
                                                    className="min-w-0 items-baseline gap-1">
                                                    {profile.username !== '' && (
                                                        <Text
                                                            type="Data"
                                                            as="span"
                                                            className="truncate"
                                                            message={t('people.list.username', {
                                                                username: profile.username,
                                                            })}
                                                        />
                                                    )}
                                                    <Text
                                                        type="BodyMuted"
                                                        as="span"
                                                        className="shrink-0"
                                                        message={tn(
                                                            'people.list.messageCount',
                                                            profile.message_count,
                                                        )}
                                                    />
                                                </Stack>
                                            </Stack>
                                        </Pressable>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="relative z-10 [&>[data-slot=button-message]]:hidden sm:[&>[data-slot=button-message]]:inline"
                                            link={`/dashboard/team/${teamId}/profile/${profile.id}`}
                                            icon={<ArrowUpRight className="rtl:-scale-x-100" />}
                                            message={t('people.list.openProfile')}
                                        />

                                        <Text
                                            type="DataMuted"
                                            as="time"
                                            className="hidden shrink-0 sm:block"
                                            dateTime={profile.last_seen_at}
                                            message={dateLabel(profile.last_seen_at)}
                                        />

                                        <ChevronDown
                                            size={16}
                                            className={cn(
                                                'shrink-0 text-muted-foreground transition-transform',
                                                open && 'rotate-180',
                                            )}
                                        />
                                    </Stack>

                                    {open && (
                                        <Stack
                                            direction="Vertical"
                                            className="gap-3 bg-muted/30 px-5 py-4">
                                            {openThread === null && <Skeleton className="h-16" />}

                                            {openThread !== null &&
                                                openThread.messages.length === 0 && (
                                                    <Text
                                                        type="BodyMuted"
                                                        message={t('people.list.noMessages')}
                                                    />
                                                )}

                                            {openThread?.messages.map((message) => (
                                                <Stack
                                                    direction="Vertical"
                                                    key={message.id}
                                                    className={cn(
                                                        'max-w-[46ch] gap-1 rounded-lg border px-3 py-2',
                                                        message.direction === 'out'
                                                            ? 'self-end border-primary/30 bg-primary/10'
                                                            : 'self-start bg-card',
                                                    )}>
                                                    <Text
                                                        type="Body"
                                                        className="break-anywhere whitespace-pre-wrap"
                                                        message={message.text}
                                                    />
                                                    <Text
                                                        type="DataMuted"
                                                        as="time"
                                                        dateTime={message.sent_at}
                                                        message={dateTimeLabel(message.sent_at)}
                                                    />
                                                </Stack>
                                            ))}

                                            <Stack
                                                direction="Horizontal"
                                                className="flex-wrap items-center justify-between gap-3">
                                                {openThread !== null && (
                                                    <Pager
                                                        page={openThread.page}
                                                        shown={openThread.messages.length}
                                                        busy={paging}
                                                        noun={t('people.pager.messages')}
                                                        onPage={(offset) =>
                                                            void goToMessages(profile.id, offset)
                                                        }
                                                    />
                                                )}
                                            </Stack>
                                        </Stack>
                                    )}
                                </Stack>
                            );
                        })}
                    </Stack>
                )}
            </CardContent>

            {page !== null && people !== null && people.length > 0 && (
                <CardFooter className="border-t py-4">
                    <Pager
                        page={page}
                        shown={people.length}
                        busy={paging}
                        noun={t('people.pager.people')}
                        onPage={(offset) => void goTo(offset)}
                    />
                </CardFooter>
            )}
        </Card>
    );
}
