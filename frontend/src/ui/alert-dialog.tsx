import type * as React from 'react';
import { cn } from '@/libs/cn';
import { Button } from '@/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
    useDialog,
} from '@/ui/dialog';

const AlertDialog = Dialog;

const AlertDialogTrigger = DialogTrigger;

const AlertDialogTitle = DialogTitle;

const AlertDialogDescription = DialogDescription;

function AlertDialogContent({
    className,
    size = 'default',
    ...props
}: React.ComponentProps<typeof DialogContent> & {
    size?: 'default' | 'sm';
}) {
    return (
        <DialogContent
            role="alertdialog"
            data-slot="alert-dialog-content"
            data-size={size}
            showCloseButton={false}
            dismissible={false}
            className={cn(
                'group/alert-dialog-content data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg',
                className,
            )}
            {...props}
        />
    );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-dialog-header"
            className={cn(
                'grid place-items-center gap-1.5 text-center sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left',
                className,
            )}
            {...props}
        />
    );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-dialog-footer"
            className={cn(
                'flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
                className,
            )}
            {...props}
        />
    );
}

function AlertDialogAction({
    onClick,
    variant = 'default',
    ...props
}: React.ComponentProps<typeof Button>) {
    const { setOpen } = useDialog();

    return (
        <Button
            data-slot="alert-dialog-action"
            variant={variant}
            onClick={(event) => {
                onClick?.(event);
                setOpen(false);
            }}
            {...props}
        />
    );
}

function AlertDialogCancel({
    onClick,
    variant = 'outline',
    ...props
}: React.ComponentProps<typeof Button>) {
    const { setOpen } = useDialog();

    return (
        <Button
            data-slot="alert-dialog-cancel"
            variant={variant}
            onClick={(event) => {
                onClick?.(event);
                setOpen(false);
            }}
            {...props}
        />
    );
}

export {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
};
