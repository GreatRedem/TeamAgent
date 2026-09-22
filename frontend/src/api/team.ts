import { pageQuery, request, type Paged } from './client';

export interface Team
{
    id: number;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
}

export function teamCreate(name: string, description: string)
{
    return request<Team>('POST', '/team', { name, description });
}

export function teamList(page?: Partial<Paged>)
{
    return request<{ teams: Team[] } & Paged>('GET', `/team${ pageQuery(page) }`);
}

export function teamDetails(id: number)
{
    return request<Team>('GET', `/team/${ id }`);
}

export function teamUpdate(id: number, name: string, description: string)
{
    return request<Team>('PATCH', `/team/${ id }`, { name, description });
}
