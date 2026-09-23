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

// Active projects by default; `archived` lists only the archived ones instead.
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

// Final: the server only deletes a project that is already archived.
export function teamRemove(id: number) {
    return request<{ result: string }>('DELETE', `/team/${id}`);
}

export function teamUpdate(id: number, name: string, description: string) {
    return request<Team>('PATCH', `/team/${id}`, { name, description });
}

// One person in team.json. The form owns these fields; anything else an agent recorded is kept
// by the server when the form saves.
export interface RosterMember {
    name: string;
    rank?: string;
    description?: string;
    social?: Record<string, string>;
    // The Telegram profile this member is, when they were added from one.
    profile_id?: number;
    [field: string]: unknown;
}

export function rosterRead(teamId: number) {
    return request<{ members: RosterMember[]; total: number; updated_at?: string } & Paged>(
        'GET',
        `/team/${teamId}/roster?limit=500`,
    );
}

// Saves one member. `previousName` is who they were saved as; leave it out to add someone.
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
