import { Card, CardContent } from '@/ui/card';
import { Progress } from '@/ui/progress';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function Stat({
    label,
    value,
    unit,
    note,
    meter,
    tone = 'primary',
}: {
    label: string;
    value: string | number;
    unit?: string;
    note?: string;
    meter?: number;
    tone?: 'primary' | 'warning' | 'destructive';
}) {
    return (
        <Card gap={2} variant="muted">
            <CardContent padding="compact" className="grid gap-2">
                <Text type="BodyMuted" message={label} />

                <Stack direction="Horizontal" className="items-baseline gap-1">
                    <Text type="Stat" as="span" message={value} />
                    {unit !== undefined && <Text type="BodyMuted" as="span" message={unit} />}
                </Stack>

                {meter !== undefined && (
                    <Progress
                        value={Math.min(100, Math.max(0, meter))}
                        size="thin"
                        track="well"
                        tone={tone}
                    />
                )}

                {note !== undefined && <Text type="Caption" message={note} />}
            </CardContent>
        </Card>
    );
}
