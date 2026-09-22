import type { ComponentProps } from 'react';
import { cn } from 'cn';

export function DataValue({ className, ...props }: ComponentProps<'span'>)
{
    return <span className={ cn('font-mono text-2xs text-muted-foreground break-anywhere', className) } { ...props } />;
}

export function DataList({ className, ...props }: ComponentProps<'dl'>)
{
    return <dl className={ cn('grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm', className) } { ...props } />;
}

export function DataRow({ label, children }: { label: string; children: React.ReactNode })
{
    return (
        <>
            <dt className="text-muted-foreground">{ label }</dt>
            <dd className="m-0 font-mono text-2xs break-anywhere">{ children }</dd>
        </>
    );
}
