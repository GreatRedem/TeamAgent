import type * as React from 'react';

import { cn } from '@/libs/cn';
import type { Status } from '@/ui/status-dot';

const cardVariant = {
    raised: { surface: 'rounded-xl bg-card shadow-raised', inset: 'py-5' },
    muted: { surface: 'rounded-lg bg-muted/40', inset: 'py-3.5' },
};

const cardGap = { 0: 'gap-0', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 5: 'gap-5' };

const cardSignal: Record<Status, string> = {
    live: 'border-l-primary',
    degraded: 'border-l-warning',
    off: 'border-l-neutral',
    failed: 'border-l-destructive',
};

function Card({
    className,
    variant = 'raised',
    gap = 5,
    flush = false,
    signal,
    ...props
}: React.ComponentProps<'div'> & {
    variant?: keyof typeof cardVariant;
    gap?: keyof typeof cardGap;
    flush?: boolean;
    signal?: Status;
}) {
    return (
        <div
            data-slot="card"
            data-variant={variant}
            className={cn(
                'flex flex-col border text-card-foreground',
                cardVariant[variant].surface,
                flush ? 'py-0' : cardVariant[variant].inset,
                cardGap[gap],
                signal !== undefined && `border-l-2 ${cardSignal[signal]}`,
                className,
            )}
            {...props}
        />
    );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-header"
            className={cn(
                '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5',
                className,
            )}
            {...props}
        />
    );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-title"
            className={cn('text-base font-semibold leading-heading', className)}
            {...props}
        />
    );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-description"
            className={cn('text-sm leading-body text-muted-foreground', className)}
            {...props}
        />
    );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-action"
            className={cn(
                'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
                className,
            )}
            {...props}
        />
    );
}

const cardContentPadding = { default: 'px-5', compact: 'px-4', none: 'px-0' };

function CardContent({
    className,
    padding = 'default',
    ...props
}: React.ComponentProps<'div'> & { padding?: keyof typeof cardContentPadding }) {
    return (
        <div
            data-slot="card-content"
            className={cn(cardContentPadding[padding], className)}
            {...props}
        />
    );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-footer"
            className={cn('flex items-center px-5 [.border-t]:pt-5', className)}
            {...props}
        />
    );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
