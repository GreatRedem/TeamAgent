import type * as React from 'react';

import { cn } from '@/libs/cn';

// Preformatted machine text such as a request body or a stored note. Like Text, it takes a
// `message` and never children.
function CodeBlock({
    className,
    message,
    ...props
}: Omit<React.ComponentProps<'pre'>, 'children'> & { message: string }) {
    return (
        <pre
            data-slot="code-block"
            className={cn(
                'm-0 overflow-auto rounded-md border bg-well p-3 font-mono text-2xs leading-body whitespace-pre-wrap',
                className,
            )}
            {...props}>
            {message}
        </pre>
    );
}

export { CodeBlock };
