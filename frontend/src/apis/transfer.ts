import { send } from './client';

export interface ImportReport {
    from: string;
    imported: Record<string, number>;
    skipped: Record<string, number>;
    notes: { code: string; count?: number; files?: string }[];
}

export async function teamExport(teamId: number) {
    const response = await send('GET', `/team/${teamId}/export`);
    const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1];

    return { file: await response.blob(), name: name ?? `nura-project-${teamId}.zip` };
}

export async function teamImport(teamId: number, file: Blob): Promise<ImportReport> {
    const response = await send('POST', `/team/${teamId}/import`, file, 'application/zip');

    return (await response.json()) as ImportReport;
}
