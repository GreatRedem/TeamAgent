import { XIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/libs/cn';
import { Button } from '@/ui/button';
import { Slot } from '@/ui/slot';

type DialogState = {
    open: boolean;
    setOpen: (open: boolean) => void;
    titleId: string;
    descriptionId: string;
};

const DialogContext = React.createContext<DialogState | null>(null);

function useDialog() {
    const state = React.useContext(DialogContext);

    if (state === null) {
        throw new Error('Dialog parts must sit inside <Dialog>');
    }

    return state;
}

function Dialog({
    open,
    defaultOpen = false,
    onOpenChange,
    children,
}: {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
}) {
    const [inner, setInner] = React.useState(defaultOpen);
    const titleId = React.useId();
    const descriptionId = React.useId();
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
        <DialogContext value={{ open: isOpen, setOpen, titleId, descriptionId }}>
            {children}
        </DialogContext>
    );
}

function DialogTrigger({
    asChild = false,
    onClick,
    ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
    const { setOpen } = useDialog();
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp
            data-slot="dialog-trigger"
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                onClick?.(event);
                setOpen(true);
            }}
            {...props}
        />
    );
}

function DialogClose({
    asChild = false,
    onClick,
    ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
    const { setOpen } = useDialog();
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp
            data-slot="dialog-close"
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                onClick?.(event);
                setOpen(false);
            }}
            {...props}
        />
    );
}

// The native modal: top layer, focus trap, inert page and Escape come from the browser.
// Children mount only while open, so a form inside starts fresh each time.
const dialogSize = { default: 'sm:max-w-lg', sm: 'sm:max-w-sm' };

function DialogContent({
    className,
    children,
    showCloseButton = true,
    dismissible = true,
    size = 'default',
    role,
    ...props
}: React.ComponentProps<'dialog'> & {
    showCloseButton?: boolean;
    dismissible?: boolean;
    size?: keyof typeof dialogSize;
}) {
    const { open, setOpen, titleId, descriptionId } = useDialog();
    const ref = React.useRef<HTMLDialogElement>(null);

    React.useEffect(() => {
        if (open) {
            ref.current?.showModal();
        }
    }, [open]);

    if (!open) {
        return null;
    }

    return (
        <dialog
            ref={ref}
            role={role}
            data-slot="dialog-content"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onCancel={(event) => {
                event.preventDefault();

                if (dismissible) {
                    setOpen(false);
                }
            }}
            onMouseDown={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const outside =
                    event.clientX < box.left ||
                    event.clientX > box.right ||
                    event.clientY < box.top ||
                    event.clientY > box.bottom;

                if (dismissible && outside) {
                    setOpen(false);
                }
            }}
            className={cn(
                'm-auto grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-6 text-foreground shadow-lg transition-[opacity,scale] duration-200 outline-none backdrop:bg-black/50 starting:scale-95 starting:opacity-0',
                dialogSize[size],
                className,
            )}
            {...props}>
            {children}
            {showCloseButton && (
                <DialogClose className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
                    <XIcon />
                    <span className="sr-only">Close</span>
                </DialogClose>
            )}
        </dialog>
    );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="dialog-header"
            className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
            {...props}
        />
    );
}

const dialogFooterAlign = { end: 'sm:justify-end', between: 'sm:justify-between' };

function DialogFooter({
    className,
    showCloseButton = false,
    align = 'end',
    children,
    ...props
}: React.ComponentProps<'div'> & {
    showCloseButton?: boolean;
    align?: keyof typeof dialogFooterAlign;
}) {
    return (
        <div
            data-slot="dialog-footer"
            className={cn(
                'flex flex-col-reverse gap-2 sm:flex-row',
                dialogFooterAlign[align],
                className,
            )}
            {...props}>
            {children}
            {showCloseButton && (
                <DialogClose asChild>
                    <Button variant="outline" message="Close" />
                </DialogClose>
            )}
        </div>
    );
}

function DialogTitle({ className, children, ...props }: React.ComponentProps<'h2'>) {
    const { titleId } = useDialog();

    return (
        <h2
            id={titleId}
            data-slot="dialog-title"
            className={cn('text-lg font-semibold', className)}
            {...props}>
            {children}
        </h2>
    );
}

function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
    const { descriptionId } = useDialog();

    return (
        <p
            id={descriptionId}
            data-slot="dialog-description"
            className={cn('text-sm text-muted-foreground', className)}
            {...props}
        />
    );
}

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    useDialog,
};
