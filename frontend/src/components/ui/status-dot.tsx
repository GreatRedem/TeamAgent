import { cn } from 'cn';

import { STATUS_FILL } from '@/lib/constant';

export type Status = 'live' | 'degraded' | 'off' | 'failed';

export function StatusDot({ status, label, className }: { status: Status; label?: string; className?: string })
{
    return (
        <span
            className={ cn('inline-block size-1.5 shrink-0 rounded-full', STATUS_FILL[status], className) }
            role={ label === undefined ? undefined : 'img' }
            aria-label={ label }
            aria-hidden={ label === undefined ? true : undefined }
        />
    );
}
