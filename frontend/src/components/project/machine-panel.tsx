import { useEffect, useState } from 'react';

import { ApiError, type SystemMetrics, systemMetrics } from '@/apis';
import { Stat } from '@/components/stat';
import { METRICS_REFRESH } from '@/libs/constant';
import { byteLabel, uptimeLabel } from '@/libs/format';
import { Alert, AlertDescription } from '@/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';

function share(used: number, total: number): number {
    return total <= 0 ? 0 : Math.round((used / total) * 100);
}

function tone(percent: number): 'primary' | 'warning' | 'destructive' {
    if (percent >= 90) {
        return 'destructive';
    }

    return percent >= 75 ? 'warning' : 'primary';
}

export function MachinePanel() {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const read = () => {
            systemMetrics()
                .then((payload) => {
                    if (active) {
                        setMetrics(payload);
                        setError(null);
                    }
                })
                .catch((cause: unknown) => {
                    if (active) {
                        setError(
                            cause instanceof ApiError ? cause.result : 'The server did not answer.',
                        );
                    }
                });
        };

        read();

        const timer = window.setInterval(read, METRICS_REFRESH);

        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    const memory = metrics === null ? 0 : share(metrics.memory_used, metrics.memory_total);
    const disk = metrics === null ? 0 : share(metrics.disk_used, metrics.disk_total);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Server</CardTitle>
                <CardDescription>
                    {metrics === null
                        ? 'Reading the machine.'
                        : `Running for ${uptimeLabel(metrics.uptime_seconds)} on ${metrics.cpu_cores} cores.`}
                </CardDescription>
            </CardHeader>

            <CardContent>
                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            {error} Metrics will retry on their own.
                        </AlertDescription>
                    </Alert>
                )}

                {metrics === null && error === null && (
                    <Stack
                        direction="Vertical"
                        className="gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:grid">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <Skeleton radius="lg" className="h-[7.5rem]" key={i} />
                        ))}
                    </Stack>
                )}

                {metrics !== null && (
                    <Stack
                        direction="Vertical"
                        className="gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:grid">
                        <Stat
                            label="Processor"
                            value={metrics.cpu_percent}
                            unit="%"
                            meter={metrics.cpu_percent}
                            tone={tone(metrics.cpu_percent)}
                            note={`${metrics.cpu_cores} cores`}
                        />

                        <Stat
                            label="Memory"
                            value={memory}
                            unit="%"
                            meter={memory}
                            tone={tone(memory)}
                            note={`${byteLabel(metrics.memory_used)} of ${byteLabel(metrics.memory_total)} in use`}
                        />

                        <Stat
                            label="Disk"
                            value={disk}
                            unit="%"
                            meter={disk}
                            tone={tone(disk)}
                            note={
                                metrics.disk_total === 0
                                    ? 'Not readable on this host'
                                    : `${byteLabel(metrics.disk_used)} of ${byteLabel(metrics.disk_total)} in use`
                            }
                        />

                        <Stat
                            label="People signed in"
                            value={metrics.active_users.toLocaleString()}
                            note="Made a request in the last five minutes"
                        />

                        <Stat
                            label="Open connections"
                            value={metrics.connections.toLocaleString()}
                            note="Sockets the API is holding right now"
                        />

                        <Stat
                            label="Uptime"
                            value={uptimeLabel(metrics.uptime_seconds)}
                            note="Since the host last booted"
                        />
                    </Stack>
                )}
            </CardContent>
        </Card>
    );
}
