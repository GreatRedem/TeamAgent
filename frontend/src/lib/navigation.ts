export function activeTeamId(pathname: string): number
{
    const match = /^\/dashboard\/team\/(\d+)/.exec(pathname);

    return match ? Number(match[1]) : 0;
}

export function teamPath(teamId: number, destination = ''): string
{
    return `/dashboard/team/${ teamId }${ destination === '' ? '' : `/${ destination }` }`;
}
