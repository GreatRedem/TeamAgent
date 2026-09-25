import type { PlanKey } from './account';
import { type Paged, pageQuery, request } from './client';

export type TicketStatus = 'open' | 'answered' | 'closed';

export interface Ticket {
    id: number;
    subject: string;
    status: TicketStatus;
    customer: string;
    created_at: string;
    updated_at: string;
}

export interface TicketMessage {
    id: number;
    staff: boolean;
    body: string;
    created_at: string;
}

export interface TicketAccount {
    id: number;
    wallet: string | null;
    phone: string | null;
    plan: PlanKey;
    chosen_plan: PlanKey;
    plan_until: string | null;
}

export type TicketPage = Paged & { tickets: Ticket[] };

export function ticketList(page?: Partial<Paged>) {
    return request<TicketPage>('GET', `/ticket${pageQuery(page)}`);
}

export function supportList(status: TicketStatus | 'all', page?: Partial<Paged>) {
    const query = pageQuery(page);
    const filter = status === 'all' ? '' : `${query === '' ? '?' : '&'}status=${status}`;

    return request<TicketPage>('GET', `/support/ticket${query}${filter}`);
}

export function ticketCreate(subject: string, body: string) {
    return request<Ticket>('POST', '/ticket', { subject, body });
}

export function ticketDetails(ticketId: number) {
    return request<{ ticket: Ticket; messages: TicketMessage[]; account: TicketAccount | null }>(
        'GET',
        `/ticket/${ticketId}`,
    );
}

export function ticketReply(ticketId: number, body: string) {
    return request<TicketMessage>('POST', `/ticket/${ticketId}/message`, { body });
}

export function ticketStatusSet(ticketId: number, status: 'open' | 'closed') {
    return request<Ticket>('PATCH', `/ticket/${ticketId}`, { status });
}

export function accountPlanSet(accountId: number, plan: PlanKey, planUntil: string | null) {
    return request<{ plan: PlanKey; plan_until: string | null }>(
        'PATCH',
        `/support/account/${accountId}`,
        { plan, plan_until: planUntil },
    );
}
