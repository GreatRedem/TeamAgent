import type * as React from 'react';

import { cn } from '@/libs/cn';

const skeletonRadius = { md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl' };

function Skeleton({
    className,
    radius = 'md',
    ...props
}: React.ComponentProps<'div'> & { radius?: keyof typeof skeletonRadius }) {
    return (
        <div
            data-slot="skeleton"
            className={cn('animate-pulse bg-accent', skeletonRadius[radius], className)}
            {...props}
        />
    );
}

export { Skeleton };
