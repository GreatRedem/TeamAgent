import type * as React from 'react';

import { cn } from '@/libs/cn';

function Switch({
    className,
    size = 'default',
    checked = false,
    onCheckedChange,
    onClick,
    ...props
}: Omit<React.ComponentProps<'button'>, 'value'> & {
    size?: 'sm' | 'default';
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}) {
    const state = checked ? 'checked' : 'unchecked';

    return (
        <button
            type="button"
            data-slot="switch"
            data-size={size}
            data-state={state}
            onClick={(event) => {
                onClick?.(event);
                onCheckedChange?.(!checked);
            }}
            className={cn(
                'peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80',
                className,
            )}
            {...props}>
            <span
                data-slot="switch-thumb"
                data-state={state}
                className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:ltr:translate-x-[calc(100%-2px)] data-[state=checked]:rtl:-translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
            />
        </button>
    );
}

export { Switch };
