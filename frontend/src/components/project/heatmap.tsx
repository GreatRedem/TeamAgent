import type { HeatmapDay } from '@/apis';
import { cn } from '@/libs/cn';
import { HEAT_SCALE, WEEKDAYS } from '@/libs/constant';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

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
        <Stack direction="Vertical" className="gap-3">
            <Stack direction="Horizontal" className="items-start gap-2 overflow-x-auto pb-1">
                <Stack direction="Vertical" className="shrink-0 gap-1" aria-hidden="true">
                    {WEEKDAYS.map((label, i) => (
                        <Text
                            type="Caption"
                            as="span"
                            className="flex h-3 items-center"
                            key={label}
                            message={i % 2 === 1 ? label : ''}
                        />
                    ))}
                </Stack>

                <Stack direction="Horizontal" className="gap-1">
                    {weeks.map((week, w) => (
                        <Stack
                            direction="Vertical"
                            className="gap-1"
                            // biome-ignore lint/suspicious/noArrayIndexKey: a week column in a fixed calendar grid; the list is static and never reorders, so the index is its identity
                            key={w}>
                            {week.map((day, d) =>
                                day === null ? (
                                    <span
                                        className="size-3"
                                        // biome-ignore lint/suspicious/noArrayIndexKey: a weekday slot in a fixed calendar grid; the list is static and never reorders, so the index is its identity
                                        key={d}
                                    />
                                ) : (
                                    <span
                                        className={cn(
                                            'size-3 rounded-sm',
                                            HEAT_SCALE[level(day, busiest)],
                                            day.errors > 0 && 'ring-1 ring-destructive',
                                        )}
                                        // biome-ignore lint/suspicious/noArrayIndexKey: a weekday slot in a fixed calendar grid; the list is static and never reorders, so the index is its identity
                                        key={d}
                                        title={`${day.date}: ${day.total} action${day.total === 1 ? '' : 's'}${day.errors > 0 ? `, ${day.errors} failed` : ''}`}
                                    />
                                ),
                            )}
                        </Stack>
                    ))}
                </Stack>
            </Stack>

            <Stack direction="Horizontal" className="flex-wrap items-center gap-2">
                <Text type="Caption" as="span" message="Quieter" />
                {HEAT_SCALE.map((fill) => (
                    <span className={cn('size-3 rounded-sm', fill)} key={fill} />
                ))}
                <Text type="Caption" as="span" message="Busier" />
                <Stack direction="Horizontal" as="span" className="ml-3 items-center gap-1.5">
                    <span className="size-3 rounded-sm bg-scale-0 ring-1 ring-destructive" />
                    <Text type="Caption" as="span" message="Had a failure" />
                </Stack>
            </Stack>
        </Stack>
    );
}
