import { request } from './client';

export interface SystemMetrics
{
    cpu_percent: number;
    cpu_cores: number;
    memory_total: number;
    memory_used: number;
    disk_total: number;
    disk_used: number;
    active_users: number;
    connections: number;
    uptime_seconds: number;
}

export function systemMetrics()
{
    return request<SystemMetrics>('GET', '/system/metrics');
}
