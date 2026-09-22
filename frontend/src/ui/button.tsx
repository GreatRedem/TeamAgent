import * as React from 'react';
import { Link } from 'react-router';

import { cn } from '@/libs/cn';

const buttonVariant = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    destructive:
        'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
    outline:
        'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
    'ghost-destructive': 'text-destructive hover:bg-destructive/10 hover:text-destructive',
    'secondary-destructive': 'bg-secondary text-destructive hover:bg-secondary/80',
    link: 'text-primary underline-offset-4 hover:underline',
};

const buttonSize = {
    default: 'h-9 px-4 py-2 has-[>svg]:px-3',
    xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
    sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
    lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
    icon: 'size-9',
    'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
    'icon-sm': 'size-8',
    'icon-lg': 'size-10',
};

type ButtonVariants = {
    variant?: keyof typeof buttonVariant;
    size?: keyof typeof buttonSize;
    className?: string;
};

function buttonVariants({ variant = 'default', size = 'default', className }: ButtonVariants = {}) {
    return cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm leading-control font-medium whitespace-nowrap no-underline transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        buttonVariant[variant],
        buttonSize[size],
        className,
    );
}

type ButtonProps = Omit<React.ComponentProps<'button'>, 'children'> &
    ButtonVariants & {
        // A route to go to: the button renders as a router link.
        link?: string;
        icon?: React.ReactElement<{ 'aria-hidden'?: boolean }>;
        iconPosition?: 'start' | 'end';
        message?: string;
    };

// Buttons take a `message` and an `icon`, never children. `link` turns one into navigation.
// A button is `type="button"` unless it says otherwise, so only an explicit submit sends a form.
function Button({
    className,
    variant = 'default',
    size = 'default',
    link,
    icon,
    iconPosition = 'start',
    message,
    type = 'button',
    ...props
}: ButtonProps) {
    const glyph = icon && React.cloneElement(icon, { 'aria-hidden': true });
    const content = (
        <>
            {iconPosition === 'start' && glyph}
            {message !== undefined && (
                <span data-slot="button-message" className="truncate">
                    {message}
                </span>
            )}
            {iconPosition === 'end' && glyph}
        </>
    );
    const shared = {
        'data-slot': 'button',
        'data-variant': variant,
        'data-size': size,
        className: buttonVariants({ variant, size, className }),
    };

    if (link !== undefined) {
        return (
            <Link to={link} {...shared} {...(props as React.ComponentProps<'a'>)}>
                {content}
            </Link>
        );
    }

    return (
        <button type={type} {...shared} {...props}>
            {content}
        </button>
    );
}

export { Button, type ButtonProps, buttonVariants };
