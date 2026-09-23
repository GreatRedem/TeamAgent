import type { HeatmapDay } from '@/apis';
import { cn } from '@/libs/cn';
import { WEEKDAYS } from '@/libs/constant';
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

function level(value: number, busiest: number): number {
    if (value === 0) {
        return 0;
    }

    return Math.min(4, Math.ceil((value / Math.max(1, busiest)) * 4));
}

export function Heatmap({
    days,
    count,
    scale,
    noun,
}: {
    days: HeatmapDay[];
    count: (day: HeatmapDay) => number;
    scale: string[];
    noun: [one: string, many: string];
}) {
    const weeks = toWeeks(days);
    const busiest = Math.max(0, ...days.map(count));

    return (
        <Stack direction="Vertical" className="gap-3">
            <Stack direction="Horizontal" className="flex-row-reverse overflow-x-auto pb-1">
                <Stack
                    direction="Vertical"
                    className="grid grow grid-flow-col grid-rows-7 gap-1"
                    style={{
                        gridTemplateColumns: `auto repeat(${weeks.length}, minmax(0.625rem, 1fr))`,
                    }}>
                    {WEEKDAYS.map((label, i) => (
                        <Text
                            type="Caption"
                            as="span"
                            className="flex items-center pr-1"
                            aria-hidden="true"
                            key={label}
                            message={i % 2 === 1 ? label : ''}
                        />
                    ))}

                    {weeks.flat().map((day, i) => {
                        if (day === null) {
                            return (
                                <Stack
                                    direction="Horizontal"
                                    as="span"
                                    className="aspect-square"
                                    // biome-ignore lint/suspicious/noArrayIndexKey: a weekday slot in a fixed calendar grid; the list is static and never reorders, so the index is its identity
                                    key={i}
                                />
                            );
                        }

                        const value = count(day);

                        return (
                            <Stack
                                direction="Horizontal"
                                as="span"
                                className={cn(
                                    'aspect-square rounded-sm',
                                    scale[level(value, busiest)],
                                )}
                                key={day.date}
                                title={`${day.date}: ${value} ${value === 1 ? noun[0] : noun[1]}`}
                            />
                        );
                    })}
                </Stack>
            </Stack>

            <Stack direction="Horizontal" className="flex-wrap items-center gap-2">
                <Text type="Caption" as="span" message="Fewer" />
                {scale.map((fill) => (
                    <Stack
                        direction="Horizontal"
                        as="span"
                        className={cn('size-3 rounded-sm', fill)}
                        key={fill}
                    />
                ))}
                <Text type="Caption" as="span" message="More" />
            </Stack>
        </Stack>
    );
}
