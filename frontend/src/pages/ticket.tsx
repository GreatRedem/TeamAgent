import { ArrowLeft, RotateCcw, Send, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import {
    ApiError,
    type Ticket,
    type TicketAccount,
    type TicketMessage,
    ticketDetails,
    ticketReply,
    ticketStatusSet,
} from '@/apis';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { PlanControl } from '@/components/plan-control';
import { cn } from '@/libs/cn';
import { TICKET_BODY_MAX, TICKET_STATUS } from '@/libs/constant';
import { dateLabel, dateTimeLabel } from '@/libs/format';
import { apiError, t } from '@/libs/i18n';
import { clearAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';
import { Textarea } from '@/ui/textarea';

interface Details {
    ticket: Ticket;
    messages: TicketMessage[];
    account: TicketAccount | null;
}

export function TicketPage() {
    const navigate = useNavigate();
    const { ticketId } = useParams<{ ticketId: string }>();
    const id = Number(ticketId);

    const [details, setDetails] = useState<Details | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setDetails(await ticketDetails(id));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 401) {
                clearAccessToken();
                await navigate('/', { replace: true });

                return;
            }

            setError(apiError(cause, 'support.thread.loadFailed'));
        }
    }, [id, navigate]);

    useEffect(() => {
        void load();
    }, [load]);

    const send = async (event: FormEvent) => {
        event.preventDefault();

        setBusy(true);
        setActionError(null);

        try {
            await ticketReply(id, reply.trim());
            setReply('');
            await load();
        } catch (cause) {
            setActionError(apiError(cause, 'support.thread.replyFailed'));
        } finally {
            setBusy(false);
        }
    };

    const toggle = async (status: 'open' | 'closed') => {
        setBusy(true);
        setActionError(null);

        try {
            await ticketStatusSet(id, status);
            await load();
        } catch (cause) {
            setActionError(apiError(cause, 'support.thread.statusFailed'));
        } finally {
            setBusy(false);
        }
    };

    const staffView = details !== null && details.account !== null;
    const closed = details?.ticket.status === 'closed';

    const author = (message: TicketMessage) =>
        message.staff
            ? t('support.thread.staff')
            : staffView
              ? (details?.ticket.customer ?? t('support.thread.customer'))
              : t('support.thread.you');

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                className="self-start"
                link={staffView ? '/dashboard/support' : '/dashboard'}
                icon={<ArrowLeft className="rtl:-scale-x-100" />}
                message={t('support.thread.back')}
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {details === null && error === null && (
                <Stack direction="Vertical" className="gap-3">
                    <Skeleton radius="xl" className="h-20" />
                    <Skeleton radius="xl" className="h-64" />
                </Stack>
            )}

            {details !== null && (
                <>
                    <PageHeader
                        title={details.ticket.subject}
                        description={t('support.thread.opened', {
                            date: dateLabel(details.ticket.created_at),
                        })}
                        actions={
                            <>
                                <Badge variant={TICKET_STATUS[details.ticket.status].variant}>
                                    {t(TICKET_STATUS[details.ticket.status].label)}
                                </Badge>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => void toggle(closed ? 'open' : 'closed')}
                                    icon={closed ? <RotateCcw /> : <X />}
                                    message={
                                        closed
                                            ? t('support.thread.reopen')
                                            : t('support.thread.close')
                                    }
                                />
                            </>
                        }
                    />

                    <Stack
                        direction="Vertical"
                        className="gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
                        <Stack direction="Vertical" className="gap-6">
                            <Card>
                                <CardContent className="flex flex-col gap-3">
                                    {details.messages.map((message) => {
                                        const mine = message.staff === staffView;

                                        return (
                                            <Stack
                                                direction="Vertical"
                                                key={message.id}
                                                className={cn(
                                                    'max-w-[60ch] gap-1 rounded-lg border px-3 py-2',
                                                    mine
                                                        ? 'self-end border-primary/30 bg-primary/10'
                                                        : 'self-start bg-muted/40',
                                                )}>
                                                <Stack
                                                    direction="Horizontal"
                                                    className="flex-wrap items-baseline gap-x-2">
                                                    <Text
                                                        type="BodyStrong"
                                                        as="span"
                                                        message={author(message)}
                                                    />
                                                    <Text
                                                        type="DataMuted"
                                                        as="time"
                                                        dateTime={message.created_at}
                                                        message={dateTimeLabel(message.created_at)}
                                                    />
                                                </Stack>
                                                <Text
                                                    type="Body"
                                                    className="break-anywhere whitespace-pre-wrap"
                                                    message={message.body}
                                                />
                                            </Stack>
                                        );
                                    })}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('support.thread.replyLabel')}</CardTitle>
                                </CardHeader>

                                <CardContent>
                                    <Stack
                                        direction="Vertical"
                                        as="form"
                                        className="gap-5"
                                        onSubmit={(event) => void send(event)}>
                                        {closed && (
                                            <Text
                                                type="BodyMuted"
                                                message={t('support.thread.closedNote')}
                                            />
                                        )}

                                        <Field label={t('support.thread.replyLabel')}>
                                            {(fieldId) => (
                                                <Textarea
                                                    id={fieldId}
                                                    required
                                                    rows={4}
                                                    value={reply}
                                                    disabled={busy}
                                                    maxLength={TICKET_BODY_MAX}
                                                    onChange={(event) =>
                                                        setReply(event.target.value)
                                                    }
                                                    placeholder={t(
                                                        'support.thread.replyPlaceholder',
                                                    )}
                                                />
                                            )}
                                        </Field>

                                        {actionError !== null && (
                                            <Alert variant="destructive">
                                                <AlertDescription>{actionError}</AlertDescription>
                                            </Alert>
                                        )}

                                        <Button
                                            type="submit"
                                            className="self-end"
                                            disabled={busy || reply.trim() === ''}
                                            icon={<Send className="rtl:-scale-x-100" />}
                                            message={
                                                busy
                                                    ? t('support.thread.sending')
                                                    : t('support.thread.send')
                                            }
                                        />
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Stack>

                        {details.account !== null && (
                            <Stack direction="Vertical" className="gap-6 xl:sticky xl:top-24">
                                <PlanControl
                                    key={`${details.account.chosen_plan}-${details.account.plan_until}`}
                                    account={details.account}
                                    onSaved={() => void load()}
                                />
                            </Stack>
                        )}
                    </Stack>
                </>
            )}
        </>
    );
}
