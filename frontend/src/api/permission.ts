import { request } from './client';
import type { TelegramProfile } from './conversation';
import type { TeamAgent } from './agent';

export interface Permission
{
    key: string;
    label: string;
    description: string;
}

export function permissionCatalog(teamId: number)
{
    return request<{ permissions: Permission[] }>('GET', `/team/${ teamId }/permission`);
}

export function profilePermissionUpdate(teamId: number, profileId: number, permissions: string[])
{
    return request<TelegramProfile>('PATCH', `/team/${ teamId }/profile/${ profileId }/permission`, { permissions });
}

export function agentPermissionCatalog(teamId: number)
{
    return request<{ permissions: Permission[] }>('GET', `/team/${ teamId }/agent-permission`);
}

export function agentPermissionUpdate(teamId: number, agentId: number, permissions: string[])
{
    return request<TeamAgent>('PATCH', `/team/${ teamId }/agent/${ agentId }/permission`, { permissions });
}
