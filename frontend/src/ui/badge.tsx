import type * as React from 'react';
import { cn } from '@/libs/cn';
import { Slot } from '@/ui/slot';

const badgeVariant = {
    default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
    destructive:
        'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
    warning: 'bg-warning text-warning-foreground [a&]:hover:bg-warning/90',
    outline: 'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
    ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 [a&]:hover:underline',
};

function badgeVariants({ variant = 'default' }: { variant?: keyof typeof badgeVariant } = {}) {
    return cn(
        'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
        badgeVariant[variant],
    );
}

function Badge({
    className,
    variant = 'default',
    asChild = false,
    ...props
}: React.ComponentProps<'span'> & { variant?: keyof typeof badgeVariant; asChild?: boolean }) {
    const Comp = asChild ? Slot : 'span';

    return (
        <Comp
            data-slot="badge"
            data-variant={variant}
            className={cn(badgeVariants({ variant }), className)}
            {...props}
        />
    );
}

export { Badge, badgeVariants };
