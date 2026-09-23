import { statfs } from 'node:fs/promises';
import os from 'node:os';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { CPU_SAMPLE } from '../../constant.js';
import { authGuard } from '../../plugins/authentication.js';
import { activeAccounts } from '../../utils/presence.js';
import { schemaSystemMetrics } from './system.schema.js';

function cpuTimes(): { idle: number; total: number } {
    let idle = 0;
    let total = 0;

    for (const cpu of os.cpus()) {
        for (const slice of Object.values(cpu.times)) {
            total += slice;
        }

        idle += cpu.times.idle;
    }

    return { idle, total };
}

export function cpuPercent(): number {
    const now = cpuTimes();
    const previous = CPU_SAMPLE.previous ?? now;
    const total = now.total - previous.total;

    CPU_SAMPLE.previous = CPU_SAMPLE.previous ?? now;

    if (total > 0) {
        CPU_SAMPLE.percent = Math.round((1 - (now.idle - previous.idle) / total) * 100);
        CPU_SAMPLE.previous = now;
    }

    return CPU_SAMPLE.percent;
}

export async function disk(): Promise<{ total: number; used: number }> {
    try {
        const stat = await statfs(process.cwd());

        const total = stat.blocks * stat.bsize;

        return { total, used: total - stat.bavail * stat.bsize };
    } catch {
        return { total: 0, used: 0 };
    }
}

export function systemMetrics(fastify: FastifyInstance) {
    const handler = async (_request: FastifyRequest, reply: FastifyReply) => {
        const memoryTotal = os.totalmem();

        const [volume, connections] = await Promise.all([
            disk(),
            new Promise<number>((resolve) =>
                fastify.server.getConnections((error, count) => resolve(error ? 0 : count)),
            ),
        ]);

        reply.send({
            cpu_percent: cpuPercent(),
            cpu_cores: os.cpus().length,
            memory_total: memoryTotal,
            memory_used: memoryTotal - os.freemem(),
            disk_total: volume.total,
            disk_used: volume.used,
            active_users: activeAccounts(),
            connections,
            uptime_seconds: Math.round(os.uptime()),
        });
    };

    return { schema: schemaSystemMetrics(), config: { ...authGuard() }, handler };
}
