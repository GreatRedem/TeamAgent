import { XIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/libs/cn';
import { t } from '@/libs/i18n';
import { Button } from '@/ui/button';
import { Slot } from '@/ui/slot';

type DialogState = {
    open: boolean;
    setOpen: (open: boolean) => void;
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

    return <DialogContext value={{ open: isOpen, setOpen }}>{children}</DialogContext>;
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
            type={asChild ? undefined : 'button'}
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
            type={asChild ? undefined : 'button'}
            data-slot="dialog-close"
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                onClick?.(event);
                setOpen(false);
            }}
            {...props}
        />
    );
}

const dialogSize = { default: 'sm:max-w-lg', sm: 'sm:max-w-sm', lg: 'sm:max-w-3xl' };

function DialogContent({
    className,
    children,
    showCloseButton = true,
    dismissible = true,
    size = 'default',
    ...props
}: React.ComponentProps<'dialog'> & {
    showCloseButton?: boolean;
    dismissible?: boolean;
    size?: keyof typeof dialogSize;
}) {
    const { open, setOpen } = useDialog();
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
            data-slot="dialog-content"
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
                <DialogClose asChild>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-3 end-3"
                        icon={<XIcon />}
                    />
                </DialogClose>
            )}
        </dialog>
    );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="dialog-header"
            className={cn('flex flex-col gap-2 text-center sm:text-start', className)}
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
                    <Button variant="outline" message={t('common.close')} />
                </DialogClose>
            )}
        </div>
    );
}

function DialogTitle({ className, children, ...props }: React.ComponentProps<'h2'>) {
    return (
        <h2
            data-slot="dialog-title"
            className={cn('text-lg font-semibold leading-heading', className)}
            {...props}>
            {children}
        </h2>
    );
}

function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
    return (
        <p
            data-slot="dialog-description"
            className={cn('text-sm leading-body text-muted-foreground', className)}
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
