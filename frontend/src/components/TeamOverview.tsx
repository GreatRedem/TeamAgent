import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { ApiError, auditHeatmap, type HeatmapDay } from '../lib/api';
import { Panel } from './Panel';
import { teamPath } from './RailNav';

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

/** The project home: twelve weeks of activity. The trail itself is under Activity. */
export function TeamOverview({ teamId }: TeamOverviewProps)
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
        <Panel
            eyebrow="Activity · 12 weeks"
            title="Every change, every run"
            actions={ <Link className="text-[13px] text-live no-underline hover:underline" to={ teamPath(teamId, 'activity') }>Open audit trail →</Link> }
        >
            { error !== null && <p className="note" data-state="error" role="alert">{ error }</p> }

            { heatmap === null && error === null && <p className="note">Loading activity...</p> }

            { heatmap !== null && (
                <>
                    <p className="note mt-0 justify-start">
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
        </Panel>
    );
}
