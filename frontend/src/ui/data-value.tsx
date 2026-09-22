import type { ComponentProps } from 'react';
import { cn } from '@/libs/cn';
import { Text } from '@/ui/text';

// Label and value pairs in two columns. `dense` tightens the rows for a list inside a card.
export function DataList({
    className,
    dense = false,
    ...props
}: ComponentProps<'dl'> & { dense?: boolean }) {
    return (
        <dl
            className={cn(
                'm-0 grid grid-cols-[auto_1fr] items-baseline gap-x-4 text-sm',
                dense ? 'gap-y-1.5' : 'gap-y-2',
                className,
            )}
            {...props}
        />
    );
}

export function DataRow({ label, value }: { label: string; value: string | number }) {
    return (
        <>
            <Text type="ForegroundMuted" as="dt" message={label} />
            <Text type="Data" as="dd" className="break-anywhere" message={value} />
        </>
    );
}
