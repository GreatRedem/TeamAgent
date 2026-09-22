import { useEffect, useState } from 'react';

import { ApiError, auditHeatmap, type HeatmapDay } from '../api';
import { CLASS_NOTE, CLASS_NOTE_ERROR, HEAT_LEVELS, WEEKDAYS } from '../lib/constant';
import { SystemMetrics } from './SystemMetrics';
import { TeamActivity } from './TeamActivity';
import { Panel } from './ui/Panel';

function toWeeks(days: HeatmapDay[]): (HeatmapDay | null)[][]
{
    if (days.length === 0)
    {
        return [ ];
    }

    const weeks: (HeatmapDay | null)[][] = [ ];

    let current: (HeatmapDay | null)[] = Array.from({ length: new Date(`${ days[0].date }T00:00:00Z`).getUTCDay() }, () => null);

    for (const day of days)
    {
        current.push(day);

        if (current.length === 7)
        {
            weeks.push(current);
            current = [ ];
        }
    }

    if (current.length > 0)
    {
        while (current.length < 7)
        {
            current.push(null);
        }

        weeks.push(current);
    }

    return weeks;
}

function level(day: HeatmapDay, busiest: number): number
{
    if (day.total === 0)
    {
        return 0;
    }

    return Math.min(4, Math.ceil((day.total / Math.max(1, busiest)) * 4));
}

export function TeamOverview({ teamId }: { teamId: number })
{
    const [ heatmap, setHeatmap ] = useState<{ days: HeatmapDay[]; total: number; busiest: number } | null>(null);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        let active = true;

        auditHeatmap(teamId)
            .then((map) =>
            {
                if (active)
                {
                    setHeatmap(map);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    const weeks = heatmap === null ? [ ] : toWeeks(heatmap.days);

    return (
        <>
            <SystemMetrics />

            <Panel eyebrow="Activity · 12 weeks" title="Every change, every run">
                { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

                { heatmap === null && error === null && <p className={ CLASS_NOTE }>Loading activity...</p> }

                { heatmap !== null && (
                    <>
                        <p className={ CLASS_NOTE }>
                            { heatmap.total } action{ heatmap.total === 1 ? '' : 's' } in the last 12 weeks
                            { heatmap.busiest > 0 && ` · busiest day ${ heatmap.busiest }` }
                        </p>

                        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                            <div className="grid shrink-0 grid-rows-[repeat(7,0.75rem)] gap-[3px] font-mono text-[10px] text-ink-3" aria-hidden="true">
                                { WEEKDAYS.map((label, i) => (
                                    <span className="leading-3" key={ label }>{ i % 2 === 1 ? label : '' }</span>
                                )) }
                            </div>

                            <div className="flex gap-[3px]">
                                { weeks.map((week, w) => (
                                    <div className="grid grid-rows-[repeat(7,0.75rem)] gap-[3px]" key={ w }>
                                        { week.map((day, d) => day === null
                                            ? <span className="size-3 rounded-[2px] bg-transparent" key={ d } />
                                            : (
                                                <span
                                                    className={ `size-3 rounded-[2px] ${ HEAT_LEVELS[level(day, heatmap.busiest)] } ${ day.errors > 0 ? 'shadow-[inset_0_0_0_1px_var(--nura-fail)]' : '' }` }
                                                    key={ d }
                                                    title={ `${ day.date }: ${ day.total } action${ day.total === 1 ? '' : 's' }${ day.errors > 0 ? `, ${ day.errors } failed` : '' }` }
                                                />
                                            )) }
                                    </div>
                                )) }
                            </div>
                        </div>

                        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                            <span>Less</span>
                            { HEAT_LEVELS.map((fill) => <span className={ `size-3 rounded-[2px] ${ fill }` } key={ fill } />) }
                            <span>More</span>
                            <span className="ms-2">outlined days had failures</span>
                        </p>
                    </>
                ) }
            </Panel>

            <TeamActivity teamId={ teamId } />
        </>
    );
}
