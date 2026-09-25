import { Inbox } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { type Paged, supportList, type Ticket, type TicketStatus } from '@/apis';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { TicketList } from '@/components/ticket-list';
import { TICKET_FILTERS } from '@/libs/constant';
import { apiError, t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';

export function SupportInbox() {
    const [status, setStatus] = useState<TicketStatus | 'all'>('open');
    const [tickets, setTickets] = useState<Ticket[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(
        async (offset: number) => {
            setPaging(true);
            setError(null);

            try {
                const next = await supportList(status, { offset });

                setTickets(next.tickets);
                setPage(next);
            } catch (cause) {
                setTickets([]);
                setError(apiError(cause, 'support.inbox.loadFailed'));
            } finally {
                setPaging(false);
            }
        },
        [status],
    );

    useEffect(() => {
        setTickets(null);
        void load(0);
    }, [load]);

    return (
        <>
            <PageHeader
                title={t('support.inbox.title')}
                description={t('support.inbox.description')}
                actions={
                    <Stack
                        direction="Horizontal"
                        className="flex-wrap gap-1 rounded-md bg-muted p-1">
                        {TICKET_FILTERS.map((filter) => (
                            <Button
                                key={filter.value}
                                size="sm"
                                variant={status === filter.value ? 'secondary' : 'ghost'}
                                className={
                                    status === filter.value ? undefined : 'text-muted-foreground'
                                }
                                onClick={() => setStatus(filter.value)}
                                message={t(filter.label)}
                            />
                        ))}
                    </Stack>
                }
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {tickets === null && <Skeleton radius="xl" className="h-64" />}

            {tickets !== null && tickets.length === 0 && error === null && (
                <EmptyState icon={Inbox} title={t('support.inbox.empty')} />
            )}

            {tickets !== null && tickets.length > 0 && (
                <Card className="overflow-hidden" gap={0}>
                    <CardContent padding="none">
                        <TicketList tickets={tickets} showCustomer />
                    </CardContent>
                </Card>
            )}

            {page !== null && tickets !== null && tickets.length > 0 && (
                <Pager
                    framed
                    page={page}
                    shown={tickets.length}
                    busy={paging}
                    noun={t('support.noun')}
                    onPage={(offset) => void load(offset)}
                />
            )}
        </>
    );
}
