import { useNavigate } from 'react-router';

import type { Ticket } from '@/apis';
import { TICKET_STATUS } from '@/libs/constant';
import { dateTimeLabel } from '@/libs/format';
import { t } from '@/libs/i18n';
import { Badge } from '@/ui/badge';
import { Pressable } from '@/ui/pressable';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function TicketList({
    tickets,
    showCustomer = false,
}: {
    tickets: Ticket[];
    showCustomer?: boolean;
}) {
    const navigate = useNavigate();

    return (
        <Stack direction="Vertical" as="ul" className="m-0 list-none p-0">
            {tickets.map((ticket) => (
                <Stack
                    direction="Vertical"
                    as="li"
                    className="border-b last:border-b-0"
                    key={ticket.id}>
                    <Pressable
                        className="flex w-full items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                        onClick={() => void navigate(`/dashboard/support/${ticket.id}`)}>
                        <Stack direction="Vertical" as="span" className="min-w-0 grow gap-0.5">
                            <Text
                                type="Strong"
                                as="span"
                                className="truncate"
                                message={ticket.subject}
                            />

                            <Stack
                                direction="Horizontal"
                                as="span"
                                className="min-w-0 flex-wrap items-baseline gap-x-2">
                                {showCustomer && (
                                    <Text
                                        type="Data"
                                        as="span"
                                        className="truncate"
                                        message={ticket.customer}
                                    />
                                )}
                                <Text
                                    type="DataMuted"
                                    as="time"
                                    dateTime={ticket.updated_at}
                                    message={dateTimeLabel(ticket.updated_at)}
                                />
                            </Stack>
                        </Stack>

                        <Badge variant={TICKET_STATUS[ticket.status].variant}>
                            {t(TICKET_STATUS[ticket.status].label)}
                        </Badge>
                    </Pressable>
                </Stack>
            ))}
        </Stack>
    );
}
