import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

import { ApiError, auditHeatmap, auditList, type AuditEntry, type HeatmapDay } from '../lib/api';

interface TeamOverviewProps
{
    teamId: number;
}

const WEEKDAYS = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];

/**
 * Buckets the flat day list into calendar columns.
 *
 * The first column is padded with nulls so every row is one weekday, which is
 * what makes the grid readable at a glance; without it the rows shift by the
 * start date and the weekday labels lie.
 */
function toWeeks(days: HeatmapDay[]): (HeatmapDay | null)[][]
{
    if (days.length === 0)
    {
        return [ ];
    }

    const weeks: (HeatmapDay | null)[][] = [ ];

    // getUTCDay, because the server buckets by UTC date.
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

/**
 * Intensity from 0 to 4, scaled against the busiest day rather than a fixed
 * ceiling, so a quiet team's chart still shows shape.
 */
function level(day: HeatmapDay, busiest: number): number
{
    if (day.total === 0)
    {
        return 0;
    }

    return Math.min(4, Math.ceil((day.total / Math.max(1, busiest)) * 4));
}

/** Activity and the recent audit trail for one team. */
export function TeamOverview({ teamId }: TeamOverviewProps)
{
    const [ heatmap, setHeatmap ] = useState<{ days: HeatmapDay[]; total: number; busiest: number } | null>(null);
    const [ entries, setEntries ] = useState<AuditEntry[] | null>(null);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        let active = true;

        Promise.all([ auditHeatmap(teamId), auditList(teamId) ])
            .then(([ map, list ]) =>
            {
                if (active)
                {
                    setHeatmap(map);
                    setEntries(list.entries);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setEntries([ ]);
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
        <section className="section">
            <h2 className="section__title">Overview</h2>

            { error !== null && <p className="status" data-state="error" role="alert">{ error }</p> }

            { heatmap === null && error === null && <p className="status">Loading activity...</p> }

            { heatmap !== null && (
                <>
                    <p className="status">
                        <Activity size={ 18 } aria-hidden="true" />
                        { heatmap.total } action{ heatmap.total === 1 ? '' : 's' } in the last 12 weeks
                        { heatmap.busiest > 0 && ` · busiest day ${ heatmap.busiest }` }
                    </p>

                    <div className="heatmap">
                        <div className="heatmap__days" aria-hidden="true">
                            { WEEKDAYS.map((label, i) => (
                                // Every other label, or they collide at this cell size.
                                <span className="heatmap__day" key={ label }>{ i % 2 === 1 ? label : '' }</span>
                            )) }
                        </div>

                        <div className="heatmap__grid">
                            { weeks.map((week, w) => (
                                <div className="heatmap__week" key={ w }>
                                    { week.map((day, d) => day === null
                                        ? <span className="heatmap__cell heatmap__cell--empty" key={ d } />
                                        : (
                                            <span
                                                className="heatmap__cell"
                                                key={ d }
                                                data-level={ level(day, heatmap.busiest) }
                                                data-errors={ day.errors > 0 ? 'yes' : undefined }
                                                title={ `${ day.date }: ${ day.total } action${ day.total === 1 ? '' : 's' }${ day.errors > 0 ? `, ${ day.errors } failed` : '' }` }
                                            />
                                        )) }
                                </div>
                            )) }
                        </div>
                    </div>

                    <p className="heatmap__legend">
                        <span>Less</span>
                        { [ 0, 1, 2, 3, 4 ].map((l) => <span className="heatmap__cell" key={ l } data-level={ l } />) }
                        <span>More</span>
                        <span className="heatmap__legend-note">outlined days had failures</span>
                    </p>
                </>
            ) }

            { entries !== null && entries.length === 0 && <p className="status">Nothing recorded yet.</p> }

            { entries !== null && entries.length > 0 && (
                <ul className="list">
                    { entries.map((entry) => (
                        <li className="list__item list__item--row" key={ entry.id }>
                            <span className="list__text">
                                <span className="list__name">
                                    { entry.action }
                                    { entry.target !== '' && <span className="list__meta"> { entry.target }</span> }
                                </span>

                                <span className="list__meta">
                                    <span className="badge" data-mode={ entry.actor }>{ entry.actor }</span>
                                    { new Date(entry.created_at).toLocaleString() }
                                    { entry.duration_ms > 0 && ` · ${ entry.duration_ms }ms` }
                                    { entry.detail !== '' && ` · ${ entry.detail }` }
                                </span>
                            </span>

                            <span className="probe" data-state={ entry.outcome === 'ok' ? 'ok' : entry.outcome === 'error' ? 'error' : 'pending' }>
                                { entry.outcome }
                            </span>
                        </li>
                    )) }
                </ul>
            ) }
        </section>
    );
}
