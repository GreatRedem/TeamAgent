import { cn } from 'cn';

import type { HeatmapDay } from '@/api';
import { HEAT_SCALE, WEEKDAYS } from '@/lib/constant';

function toWeeks(days: HeatmapDay[]): (HeatmapDay | null)[][] {
    if (days.length === 0) {
        return [];
    }

    const weeks: (HeatmapDay | null)[][] = [];

    let current: (HeatmapDay | null)[] = Array.from(
        { length: new Date(`${days[0].date}T00:00:00Z`).getUTCDay() },
        () => null,
    );

    for (const day of days) {
        current.push(day);

        if (current.length === 7) {
            weeks.push(current);
            current = [];
        }
    }

    if (current.length > 0) {
        while (current.length < 7) {
            current.push(null);
        }

        weeks.push(current);
    }

    return weeks;
}

function level(day: HeatmapDay, busiest: number): number {
    if (day.total === 0) {
        return 0;
    }

    return Math.min(4, Math.ceil((day.total / Math.max(1, busiest)) * 4));
}

export function Heatmap({ days, busiest }: { days: HeatmapDay[]; busiest: number }) {
    const weeks = toWeeks(days);

    return (
        <div className="grid gap-3">
            <div className="flex items-start gap-2 overflow-x-auto pb-1">
                <div
                    className="flex shrink-0 flex-col gap-1 text-2xs text-muted-foreground"
                    aria-hidden="true"
                >
                    {WEEKDAYS.map((label, i) => (
                        <span className="flex h-3 items-center" key={label}>
                            {i % 2 === 1 ? label : ''}
                        </span>
                    ))}
                </div>

                <div className="flex gap-1">
                    {weeks.map((week, w) => (
                        <div className="flex flex-col gap-1" key={w}>
                            {week.map((day, d) =>
                                day === null ? (
                                    <span className="size-3" key={d} />
                                ) : (
                                    <span
                                        className={cn(
                                            'size-3 rounded-sm',
                                            HEAT_SCALE[level(day, busiest)],
                                            day.errors > 0 && 'ring-1 ring-destructive',
                                        )}
                                        key={d}
                                        title={`${day.date}: ${day.total} action${day.total === 1 ? '' : 's'}${day.errors > 0 ? `, ${day.errors} failed` : ''}`}
                                    />
                                ),
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <p className="m-0 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                <span>Quieter</span>
                {HEAT_SCALE.map((fill) => (
                    <span className={cn('size-3 rounded-sm', fill)} key={fill} />
                ))}
                <span>Busier</span>
                <span className="ml-3 flex items-center gap-1.5">
                    <span className="size-3 rounded-sm bg-scale-0 ring-1 ring-destructive" />
                    Had a failure
                </span>
            </p>
        </div>
    );
}
