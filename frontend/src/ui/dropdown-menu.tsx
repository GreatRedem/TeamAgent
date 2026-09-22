import * as React from 'react';
import { cn } from '@/libs/cn';
import { Slot } from '@/ui/slot';

type MenuState = {
    open: boolean;
    setOpen: (open: boolean) => void;
    id: string;
    anchor: string;
};

const MenuContext = React.createContext<MenuState | null>(null);

function useMenu() {
    const state = React.useContext(MenuContext);

    if (state === null) {
        throw new Error('DropdownMenu parts must sit inside <DropdownMenu>');
    }

    return state;
}

function DropdownMenu({
    open,
    onOpenChange,
    children,
}: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
}) {
    const [inner, setInner] = React.useState(false);
    const id = React.useId();
    const isOpen = open ?? inner;

    const setOpen = React.useCallback(
        (next: boolean) => {
            if (open === undefined) {
                setInner(next);
            }

            onOpenChange?.(next);
        },
        [open, onOpenChange],
    );

    return (
        <MenuContext
            value={{ open: isOpen, setOpen, id, anchor: `--menu-${id.replaceAll(':', '')}` }}>
            {children}
        </MenuContext>
    );
}

function DropdownMenuTrigger({
    asChild = false,
    style,
    ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
    const { open, id, anchor } = useMenu();
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp
            data-slot="dropdown-menu-trigger"
            popoverTarget={id}
            aria-haspopup="menu"
            aria-expanded={open}
            style={{ anchorName: anchor, ...style } as React.CSSProperties}
            {...props}
        />
    );
}

const menuAlign = {
    start: { left: 'anchor(left)' },
    center: { justifySelf: 'anchor-center' },
    end: { right: 'anchor(right)' },
};

// A native popover: light dismiss, Escape and top layer come from the browser, and CSS
// anchor positioning places it under the trigger.
function DropdownMenuContent({
    className,
    align = 'center',
    style,
    onKeyDown,
    ...props
}: React.ComponentProps<'div'> & { align?: keyof typeof menuAlign }) {
    const { open, setOpen, id, anchor } = useMenu();
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const menu = ref.current;

        if (menu === null || menu.matches(':popover-open') === open) {
            return;
        }

        if (open) {
            menu.showPopover();
        } else {
            menu.hidePopover();
        }
    }, [open]);

    return (
        <div
            ref={ref}
            id={id}
            popover="auto"
            role="menu"
            tabIndex={-1}
            data-slot="dropdown-menu-content"
            onToggle={(event) => setOpen(event.newState === 'open')}
            onKeyDown={(event) => {
                onKeyDown?.(event);

                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
                    return;
                }

                event.preventDefault();
                const items = [
                    ...event.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]'),
                ];
                const at = items.indexOf(document.activeElement as HTMLElement);
                const next =
                    event.key === 'ArrowDown' ? (at + 1) % items.length : at <= 0 ? -1 : at - 1;
                items.at(next)?.focus();
            }}
            style={
                {
                    positionAnchor: anchor,
                    inset: 'auto',
                    top: 'anchor(bottom)',
                    marginTop: '0.25rem',
                    positionTryFallbacks: 'flip-block',
                    ...menuAlign[align],
                    ...style,
                } as React.CSSProperties
            }
            className={cn(
                'min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition-[opacity,scale] duration-150 starting:scale-95 starting:opacity-0',
                className,
            )}
            {...props}
        />
    );
}

function DropdownMenuItem({
    className,
    inset,
    variant = 'default',
    asChild = false,
    onClick,
    ...props
}: React.ComponentProps<'button'> & {
    inset?: boolean;
    variant?: 'default' | 'destructive';
    asChild?: boolean;
}) {
    const { setOpen } = useMenu();
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp
            role="menuitem"
            data-slot="dropdown-menu-item"
            data-inset={inset}
            data-variant={variant}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                onClick?.(event);
                setOpen(false);
            }}
            className={cn(
                "relative flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!",
                className,
            )}
            {...props}
        />
    );
}

function DropdownMenuLabel({
    className,
    inset,
    ...props
}: React.ComponentProps<'div'> & {
    inset?: boolean;
}) {
    return (
        <div
            data-slot="dropdown-menu-label"
            data-inset={inset}
            className={cn('px-2 py-1.5 text-sm font-medium data-[inset]:pl-8', className)}
            {...props}
        />
    );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<'hr'>) {
    return (
        <hr
            data-slot="dropdown-menu-separator"
            className={cn('-mx-1 my-1 h-px border-0 bg-border', className)}
            {...props}
        />
    );
}

export {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
};
