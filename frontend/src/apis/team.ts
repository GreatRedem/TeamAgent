import { type Paged, pageQuery, request } from './client';

export interface Team {
    id: number;
    name: string;
    description: string;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
}

export function teamCreate(name: string, description: string) {
    return request<Team>('POST', '/team', { name, description });
}

export function teamList(page?: Partial<Paged>, archived = false) {
    const query = pageQuery(page);
    const filter = archived ? `${query === '' ? '?' : '&'}archived=true` : '';

    return request<{ teams: Team[] } & Paged>('GET', `/team${query}${filter}`);
}

export function teamDetails(id: number) {
    return request<Team>('GET', `/team/${id}`);
}

export function teamArchive(id: number, archived: boolean) {
    return request<Team>('PATCH', `/team/${id}/archive`, { archived });
}

export function teamRemove(id: number) {
    return request<{ result: string }>('DELETE', `/team/${id}`);
}

export function teamUpdate(id: number, name: string, description: string) {
    return request<Team>('PATCH', `/team/${id}`, { name, description });
}

export interface RosterMember {
    name: string;
    rank?: string;
    description?: string;
    social?: Record<string, string>;
    profile_id?: number;
    [field: string]: unknown;
}

export function rosterRead(teamId: number) {
    return request<{ members: RosterMember[]; total: number; updated_at?: string } & Paged>(
        'GET',
        `/team/${teamId}/roster?limit=500`,
    );
}

export function rosterMemberSave(teamId: number, member: RosterMember, previousName?: string) {
    return request<{ members: RosterMember[]; count: number }>(
        'PUT',
        `/team/${teamId}/roster/member`,
        { member, ...(previousName !== undefined && { previous_name: previousName }) },
    );
}

export function rosterMemberRemove(teamId: number, name: string) {
    return request<{ members: RosterMember[]; count: number }>(
        'DELETE',
        `/team/${teamId}/roster/member?name=${encodeURIComponent(name)}`,
    );
}
