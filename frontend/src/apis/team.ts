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
