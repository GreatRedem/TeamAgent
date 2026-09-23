import { cn } from '@/libs/cn';
import { STATUS_FILL } from '@/libs/constant';

export type Status = 'live' | 'degraded' | 'off' | 'failed';

export function StatusDot({
    status,
    label,
    className,
}: {
    status: Status;
    label?: string;
    className?: string;
}) {
    const dot = cn('inline-block size-1.5 shrink-0 rounded-full', STATUS_FILL[status], className);

    if (label === undefined) {
        return <span className={dot} />;
    }

    return <span className={dot} />;
}
