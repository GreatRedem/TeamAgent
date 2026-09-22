import type * as React from 'react';

import { cn } from '@/libs/cn';

const progressSize = { default: 'h-2', thin: 'h-1' };

const progressTrack = { default: 'bg-primary/20', well: 'bg-well' };

const progressTone = {
    primary: 'bg-primary',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
};

function Progress({
    className,
    value,
    size = 'default',
    track = 'default',
    tone = 'primary',
    ...props
}: React.ComponentProps<'div'> & {
    value?: number | null;
    size?: keyof typeof progressSize;
    track?: keyof typeof progressTrack;
    tone?: keyof typeof progressTone;
}) {
    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value ?? undefined}
            data-slot="progress"
            className={cn(
                'relative w-full overflow-hidden rounded-full',
                progressSize[size],
                progressTrack[track],
                className,
            )}
            {...props}>
            <div
                data-slot="progress-indicator"
                className={cn('h-full w-full flex-1 transition-all', progressTone[tone])}
                style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
            />
        </div>
    );
}

export { Progress };
