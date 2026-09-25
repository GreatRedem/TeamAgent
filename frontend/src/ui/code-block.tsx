import type * as React from 'react';

import { cn } from '@/libs/cn';

function CodeBlock({
    className,
    message,
    ...props
}: Omit<React.ComponentProps<'pre'>, 'children'> & { message: string }) {
    return (
        <pre
            dir="auto"
            data-slot="code-block"
            className={cn(
                'm-0 scroll-stable overflow-auto rounded-md border bg-well p-3 font-mono text-2xs leading-body whitespace-pre-wrap',
                className,
            )}
            {...props}>
            {message}
        </pre>
    );
}

export { CodeBlock };
