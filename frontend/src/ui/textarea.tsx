import type * as React from 'react';

import { cn } from '@/libs/cn';

const textareaVariant = {
    default: 'min-h-16 text-base md:text-sm',
    code: 'min-h-56 max-h-75 font-mono text-2xs',
};

function Textarea({
    className,
    variant = 'default',
    ...props
}: React.ComponentProps<'textarea'> & { variant?: keyof typeof textareaVariant }) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                'flex field-sizing-content w-full leading-body rounded-md border border-input bg-transparent px-3 py-2 shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
                textareaVariant[variant],
                className,
            )}
            {...props}
        />
    );
}

export { Textarea };
