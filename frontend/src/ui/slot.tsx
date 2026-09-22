import * as React from 'react';

import { cn } from '@/libs/cn';

type Handler = (...args: unknown[]) => void;

type SlotProps = React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode };

// Renders its only child with these props merged in, the child's own handlers running first.
function Slot({ children, className, ...props }: SlotProps) {
    if (!React.isValidElement<SlotProps>(children)) {
        return null;
    }

    const own = children.props as Record<string, unknown>;
    const theirs = props as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...theirs, ...own };

    for (const key of Object.keys(theirs)) {
        const outer = theirs[key];
        const inner = own[key];

        if (key.startsWith('on') && typeof outer === 'function' && typeof inner === 'function') {
            merged[key] = (...args: unknown[]) => {
                (inner as Handler)(...args);
                (outer as Handler)(...args);
            };
        }
    }

    merged['className'] = cn(className, own['className'] as string | undefined);

    return React.cloneElement(children, merged);
}

export { Slot };
