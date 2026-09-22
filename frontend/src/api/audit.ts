import { pageQuery, request, type Paged } from './client';

export interface AuditEntry {
    id: number;
    action: string;
    target: string;
    outcome: 'ok' | 'error' | 'skipped';
    detail: string;
    duration_ms: number;
    actor: string;
    created_at: string;
}

export interface HeatmapDay {
    date: string;
    total: number;
    errors: number;
}

export function auditList(teamId: number, page?: Partial<Paged>) {
    return request<{ entries: AuditEntry[] } & Paged>(
        'GET',
        `/team/${teamId}/audit${pageQuery(page)}`,
    );
}

export function auditHeatmap(teamId: number) {
    return request<{
        days: HeatmapDay[];
        from: string;
        to: string;
        total: number;
        busiest: number;
    }>('GET', `/team/${teamId}/audit/heatmap`);
}
