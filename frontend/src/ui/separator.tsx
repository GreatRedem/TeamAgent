import type * as React from 'react';

import { cn } from '@/libs/cn';

function Separator({
    className,
    orientation = 'horizontal',
    decorative = true,
    ...props
}: React.ComponentProps<'div'> & {
    orientation?: 'horizontal' | 'vertical';
    decorative?: boolean;
}) {
    const semantics = decorative
        ? { role: 'none' }
        : { role: 'separator', 'aria-orientation': orientation };

    return (
        <div
            data-slot="separator"
            data-orientation={orientation}
            {...semantics}
            className={cn(
                'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
                className,
            )}
            {...props}
        />
    );
}

export { Separator };
