import { t } from '@/libs/i18n';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';

export function ConfirmButton({
    label,
    title,
    description,
    confirmLabel,
    onConfirm,
    disabled,
}: {
    label: string;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
    disabled?: boolean;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost-destructive" size="sm" disabled={disabled} message={label} />
            </AlertDialogTrigger>

            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <AlertDialogCancel message={t('common.keepIt')} />
                    <AlertDialogAction
                        variant="destructive"
                        onClick={onConfirm}
                        message={confirmLabel ?? label}
                    />
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
