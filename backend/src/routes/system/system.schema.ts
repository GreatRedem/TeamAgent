export const schemaSystemMetrics = {
    response: {
        200: {
            type: 'object',
            required: [ 'cpu_percent', 'cpu_cores', 'memory_total', 'memory_used', 'disk_total', 'disk_used', 'active_users', 'connections', 'uptime_seconds' ],
            properties: {
                cpu_percent: { type: 'integer' },
                cpu_cores: { type: 'integer' },
                memory_total: { type: 'integer' },
                memory_used: { type: 'integer' },
                disk_total: { type: 'integer' },
                disk_used: { type: 'integer' },
                active_users: { type: 'integer' },
                connections: { type: 'integer' },
                uptime_seconds: { type: 'integer' }
            }
        }
    }
} as const;
