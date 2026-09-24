import { ChevronDownIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/libs/cn';

function Select({
    className,
    size = 'default',
    placeholder,
    value,
    onValueChange,
    onChange,
    children,
    ...props
}: Omit<React.ComponentProps<'select'>, 'size' | 'value'> & {
    size?: 'sm' | 'default';
    placeholder?: string;
    value?: string;
    onValueChange?: (value: string) => void;
}) {
    return (
        <div data-slot="select" className={cn('relative w-full', className)}>
            <select
                data-slot="select-trigger"
                data-size={size}
                value={value ?? ''}
                onChange={(event) => {
                    onChange?.(event);
                    onValueChange?.(event.target.value);
                }}
                className="h-9 w-full appearance-none rounded-md border border-input bg-transparent py-2 pe-8 ps-3 text-sm leading-control whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:h-8 dark:bg-input/30 dark:hover:bg-input/50 [&:has(option[value='']:checked)]:text-muted-foreground [&>option]:bg-popover [&>option]:text-popover-foreground"
                {...props}>
                {placeholder !== undefined && (
                    <option value="" disabled hidden>
                        {placeholder}
                    </option>
                )}
                {children}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground opacity-50" />
        </div>
    );
}

function SelectItem(props: React.ComponentProps<'option'>) {
    return <option data-slot="select-item" {...props} />;
}

export { Select, SelectItem };
