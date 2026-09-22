import type { ComponentProps } from 'react';
import { cn } from '@/libs/cn';
import { Text } from '@/ui/text';

export function DataList({ className, ...props }: ComponentProps<'dl'>) {
    return (
        <dl
            className={cn(
                'grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm',
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
