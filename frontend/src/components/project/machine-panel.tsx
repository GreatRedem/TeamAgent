import { useEffect, useState } from 'react';

import { type SystemMetrics, systemMetrics } from '@/apis';
import { Stat } from '@/components/stat';
import { METRICS_REFRESH } from '@/libs/constant';
import { byteLabel, numberLabel, uptimeLabel } from '@/libs/format';
import { apiError, t } from '@/libs/i18n';
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
                        setError(apiError(cause, 'overview.machine.errors.noAnswer'));
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
                <CardTitle>{t('overview.machine.title')}</CardTitle>
                <CardDescription>
                    {metrics === null
                        ? t('overview.machine.loading')
                        : t('overview.machine.running', {
                              uptime: uptimeLabel(metrics.uptime_seconds),
                              cores: metrics.cpu_cores,
                          })}
                </CardDescription>
            </CardHeader>

            <CardContent>
                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            {t('overview.machine.retry', { error })}
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
                            label={t('overview.machine.processor')}
                            value={numberLabel(metrics.cpu_percent)}
                            unit="%"
                            meter={metrics.cpu_percent}
                            tone={tone(metrics.cpu_percent)}
                            note={t('overview.machine.cores', { cores: metrics.cpu_cores })}
                        />

                        <Stat
                            label={t('overview.machine.memory')}
                            value={numberLabel(memory)}
                            unit="%"
                            meter={memory}
                            tone={tone(memory)}
                            note={t('overview.machine.inUse', {
                                used: byteLabel(metrics.memory_used),
                                total: byteLabel(metrics.memory_total),
                            })}
                        />

                        <Stat
                            label={t('overview.machine.disk')}
                            value={numberLabel(disk)}
                            unit="%"
                            meter={disk}
                            tone={tone(disk)}
                            note={
                                metrics.disk_total === 0
                                    ? t('overview.machine.diskUnreadable')
                                    : t('overview.machine.inUse', {
                                          used: byteLabel(metrics.disk_used),
                                          total: byteLabel(metrics.disk_total),
                                      })
                            }
                        />

                        <Stat
                            label={t('overview.machine.signedIn')}
                            value={numberLabel(metrics.active_users)}
                            note={t('overview.machine.signedInNote')}
                        />

                        <Stat
                            label={t('overview.machine.connections')}
                            value={numberLabel(metrics.connections)}
                            note={t('overview.machine.connectionsNote')}
                        />

                        <Stat
                            label={t('overview.machine.uptime')}
                            value={uptimeLabel(metrics.uptime_seconds)}
                            note={t('overview.machine.uptimeNote')}
                        />
                    </Stack>
                )}
            </CardContent>
        </Card>
    );
}
