import type * as React from 'react';

import { cn } from '@/libs/cn';

// A pressable surface with rich content, such as a list row that opens something.
// `Button` is for a label and an icon; reach for this only when the content is more than that.
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
