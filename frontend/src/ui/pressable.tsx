import type * as React from 'react';

import { cn } from '@/libs/cn';

function Pressable({ className, type = 'button', ...props }: React.ComponentProps<'button'>) {
    return (
        <button
            data-slot="pressable"
            type={type}
            className={cn('text-start', className)}
            {...props}
        />
    );
}

export { Pressable };
