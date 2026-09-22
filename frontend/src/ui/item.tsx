import type * as React from 'react';
import { cn } from '@/libs/cn';
import { Separator } from '@/ui/separator';
import { Slot } from '@/ui/slot';

// A list of items; each Item inside renders as an li through asChild.
function ItemGroup({ className, ...props }: React.ComponentProps<'ul'>) {
    return (
        <ul
            data-slot="item-group"
            className={cn('group/item-group flex flex-col', className)}
            {...props}
        />
    );
}

function ItemSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
    return (
        <Separator
            data-slot="item-separator"
            orientation="horizontal"
            className={cn('my-0', className)}
            {...props}
        />
    );
}

const itemVariant = {
    default: 'bg-transparent',
    outline: 'border-border',
    muted: 'bg-muted/50',
};

const itemSize = {
    default: 'gap-4 py-4',
    sm: 'gap-2.5 py-3',
};

function Item({
    className,
    variant = 'default',
    size = 'default',
    asChild = false,
    flush = false,
    ...props
}: React.ComponentProps<'div'> & {
    variant?: keyof typeof itemVariant;
    size?: keyof typeof itemSize;
    asChild?: boolean;
    // No horizontal padding: the item lines up with the text around it.
    flush?: boolean;
}) {
    const Comp = asChild ? Slot : 'div';
    return (
        <Comp
            data-slot="item"
            data-variant={variant}
            data-size={size}
            className={cn(
                'group/item flex flex-wrap items-center rounded-md border border-transparent text-sm transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:transition-colors [a]:hover:bg-accent/50',
                itemVariant[variant],
                itemSize[size],
                !flush && 'px-4',
                className,
            )}
            {...props}
        />
    );
}

const itemMediaVariant = {
    default: 'bg-transparent',
    icon: "size-8 rounded-sm border bg-muted [&_svg:not([class*='size-'])]:size-4",
    image: 'size-10 overflow-hidden rounded-sm [&_img]:size-full [&_img]:object-cover',
};

function ItemMedia({
    className,
    variant = 'default',
    ...props
}: React.ComponentProps<'div'> & { variant?: keyof typeof itemMediaVariant }) {
    return (
        <div
            data-slot="item-media"
            data-variant={variant}
            className={cn(
                'flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:translate-y-0.5 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none',
                itemMediaVariant[variant],
                className,
            )}
            {...props}
        />
    );
}

function ItemContent({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="item-content"
            className={cn(
                'flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none',
                className,
            )}
            {...props}
        />
    );
}

function ItemTitle({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="item-title"
            className={cn('flex w-fit items-center gap-2 text-sm font-medium', className)}
            {...props}
        />
    );
}

function ItemDescription({ className, ...props }: React.ComponentProps<'p'>) {
    return (
        <p
            data-slot="item-description"
            className={cn(
                'line-clamp-2 text-sm font-normal text-balance text-muted-foreground',
                '[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
                className,
            )}
            {...props}
        />
    );
}

function ItemActions({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="item-actions"
            className={cn('flex items-center gap-2', className)}
            {...props}
        />
    );
}

function ItemHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="item-header"
            className={cn('flex basis-full items-center justify-between gap-2', className)}
            {...props}
        />
    );
}

function ItemFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="item-footer"
            className={cn('flex basis-full items-center justify-between gap-2', className)}
            {...props}
        />
    );
}

export {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemGroup,
    ItemHeader,
    ItemMedia,
    ItemSeparator,
    ItemTitle,
};
