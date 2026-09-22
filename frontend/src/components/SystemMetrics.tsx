import { useEffect, useState } from 'react';

import { ApiError, systemMetrics, type SystemMetrics as Metrics } from '../api';
import { CLASS_NOTE, CLASS_NOTE_ERROR, METRICS_REFRESH } from '../lib/constant';
import { byteLabel, uptimeLabel } from '../lib/tokens';
import { Panel } from './ui/Panel';
import { StatTile } from './ui/StatTile';

function share(used: number, total: number): number
{
    return total <= 0 ? 0 : Math.round((used / total) * 100);
}

function tone(percent: number): 'live' | 'pending' | 'fail'
{
    if (percent >= 90)
    {
        return 'fail';
    }

    return percent >= 75 ? 'pending' : 'live';
}

export function SystemMetrics()
{
    const [ metrics, setMetrics ] = useState<Metrics | null>(null);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        let active = true;

        const read = () =>
        {
            systemMetrics()
                .then((payload) =>
                {
                    if (active)
                    {
                        setMetrics(payload);
                        setError(null);
                    }
                })
                .catch((cause: unknown) =>
                {
                    if (active)
                    {
                        setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
                    }
                });
        };

        read();

        const timer = window.setInterval(read, METRICS_REFRESH);

        return () =>
        {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    const memory = metrics === null ? 0 : share(metrics.memory_used, metrics.memory_total);
    const disk = metrics === null ? 0 : share(metrics.disk_used, metrics.disk_total);

    return (
        <Panel
            eyebrow="Machine"
            title="What the server is spending"
            sub={ metrics === null ? undefined : `Up ${ uptimeLabel(metrics.uptime_seconds) } · ${ metrics.cpu_cores } cores` }
        >
            { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

            { metrics === null && error === null && <p className={ CLASS_NOTE }>Reading the machine...</p> }

            { metrics !== null && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <StatTile
                        label="CPU"
                        value={ metrics.cpu_percent }
                        unit="%"
                        meter={ metrics.cpu_percent }
                        tone={ tone(metrics.cpu_percent) }
                        note={ `${ metrics.cpu_cores } cores` }
                    />

                    <StatTile
                        label="Memory"
                        value={ memory }
                        unit="%"
                        meter={ memory }
                        tone={ tone(memory) }
                        note={ `${ byteLabel(metrics.memory_used) } of ${ byteLabel(metrics.memory_total) }` }
                    />

                    <StatTile
                        label="Disk"
                        value={ disk }
                        unit="%"
                        meter={ disk }
                        tone={ tone(disk) }
                        note={ metrics.disk_total === 0 ? 'not readable here' : `${ byteLabel(metrics.disk_used) } of ${ byteLabel(metrics.disk_total) }` }
                    />

                    <StatTile
                        label="Active users"
                        value={ metrics.active_users.toLocaleString() }
                        note="signed in and asking in the last 5 minutes"
                    />

                    <StatTile
                        label="TCP connections"
                        value={ metrics.connections.toLocaleString() }
                        note="sockets open on the api right now"
                    />

                    <StatTile
                        label="Uptime"
                        value={ uptimeLabel(metrics.uptime_seconds) }
                        note="since the host last booted"
                    />
                </div>
            ) }
        </Panel>
    );
}
