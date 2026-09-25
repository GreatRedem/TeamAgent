import { Inbox, LifeBuoy, Plus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { type Paged, type Ticket, ticketCreate, ticketList } from '@/apis';
import { Field } from '@/components/field';
import { Pager } from '@/components/pager';
import { TicketList } from '@/components/ticket-list';
import { TICKET_BODY_MAX, TICKET_SUBJECT_MAX } from '@/libs/constant';
import { apiError, t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';
import { Textarea } from '@/ui/textarea';

export function SupportPanel({ staff }: { staff: boolean }) {
    const navigate = useNavigate();
    const [search, setSearch] = useSearchParams();

    const [tickets, setTickets] = useState<Ticket[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async (offset: number) => {
        setPaging(true);

        try {
            const next = await ticketList({ offset });

            setTickets(next.tickets);
            setPage(next);
        } catch (cause) {
            setTickets([]);
            setError(apiError(cause, 'support.loadFailed'));
        } finally {
            setPaging(false);
        }
    }, []);

    useEffect(() => {
        void load(0);
    }, [load]);

    useEffect(() => {
        if (search.get('ticket') !== 'plan') {
            return;
        }

        setSubject(t('support.planSubject'));
        setFormError(null);
        setOpen(true);
        setSearch({}, { replace: true });
    }, [search, setSearch]);

    const create = async (event: FormEvent) => {
        event.preventDefault();

        setBusy(true);
        setFormError(null);

        try {
            const ticket = await ticketCreate(subject.trim(), body.trim());

            await navigate(`/dashboard/support/${ticket.id}`);
        } catch (cause) {
            setFormError(apiError(cause, 'support.create.failed'));
            setBusy(false);
        }
    };

    return (
        <Card className="overflow-hidden lg:col-span-2">
            <CardHeader>
                <CardTitle>{t('support.title')}</CardTitle>
                <CardDescription>{t('support.description')}</CardDescription>

                <Stack direction="Horizontal" className="mt-2 flex-wrap gap-2">
                    {staff && (
                        <Button
                            variant="ghost"
                            size="sm"
                            link="/dashboard/support"
                            icon={<Inbox />}
                            message={t('support.inboxLink')}
                        />
                    )}
                    <Button
                        size="sm"
                        icon={<Plus />}
                        onClick={() => {
                            setSubject('');
                            setFormError(null);
                            setOpen(true);
                        }}
                        message={t('support.new')}
                    />
                </Stack>
            </CardHeader>

            <CardContent padding="none">
                {error !== null && (
                    <Stack direction="Vertical" className="px-5">
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    </Stack>
                )}

                {tickets === null && (
                    <Stack direction="Vertical" className="gap-2 px-5">
                        <Skeleton className="h-12" />
                        <Skeleton className="h-12" />
                    </Stack>
                )}

                {tickets !== null && tickets.length === 0 && error === null && (
                    <Stack direction="Horizontal" className="items-center gap-3 px-5 pb-1">
                        <LifeBuoy size={16} className="shrink-0 text-muted-foreground" />
                        <Text type="BodyMuted" message={t('support.empty')} />
                    </Stack>
                )}

                {tickets !== null && tickets.length > 0 && <TicketList tickets={tickets} />}

                {page !== null && tickets !== null && tickets.length > 0 && (
                    <Stack direction="Vertical" className="border-t px-5 pt-3">
                        <Pager
                            page={page}
                            shown={tickets.length}
                            busy={paging}
                            noun={t('support.noun')}
                            onPage={(offset) => void load(offset)}
                        />
                    </Stack>
                )}
            </CardContent>

            <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
                <DialogContent>
                    <Stack
                        direction="Vertical"
                        as="form"
                        className="gap-5"
                        onSubmit={(event) => void create(event)}>
                        <DialogHeader>
                            <DialogTitle>{t('support.create.title')}</DialogTitle>
                            <DialogDescription>{t('support.create.description')}</DialogDescription>
                        </DialogHeader>

                        <Field label={t('support.create.subject')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    required
                                    value={subject}
                                    maxLength={TICKET_SUBJECT_MAX}
                                    onChange={(event) => setSubject(event.target.value)}
                                    placeholder={t('support.create.subjectPlaceholder')}
                                />
                            )}
                        </Field>

                        <Field label={t('support.create.body')}>
                            {(id) => (
                                <Textarea
                                    id={id}
                                    required
                                    rows={5}
                                    value={body}
                                    maxLength={TICKET_BODY_MAX}
                                    onChange={(event) => setBody(event.target.value)}
                                    placeholder={t('support.create.bodyPlaceholder')}
                                />
                            )}
                        </Field>

                        {formError !== null && (
                            <Alert variant="destructive">
                                <AlertDescription>{formError}</AlertDescription>
                            </Alert>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setOpen(false)}
                                message={t('support.create.cancel')}
                            />
                            <Button
                                type="submit"
                                disabled={busy || subject.trim() === '' || body.trim() === ''}
                                message={
                                    busy ? t('support.create.busy') : t('support.create.submit')
                                }
                            />
                        </DialogFooter>
                    </Stack>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
