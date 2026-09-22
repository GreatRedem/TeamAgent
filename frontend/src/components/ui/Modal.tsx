import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

import { CLASS_ICON_BUTTON } from '../../lib/constant';

export function Modal({ open, title, sub, onClose, children }: {
    open: boolean;
    title: string;
    sub?: string;
    onClose: () => void;
    children: ReactNode;
})
{
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() =>
    {
        const dialog = ref.current;

        if (dialog === null)
        {
            return;
        }

        const onBackdrop = (event: MouseEvent) =>
        {
            if (event.target === dialog)
            {
                dialog.close();
            }
        };

        dialog.addEventListener('click', onBackdrop);

        return () => dialog.removeEventListener('click', onBackdrop);
    }, []);

    useEffect(() =>
    {
        const dialog = ref.current;

        if (dialog === null)
        {
            return;
        }

        if (open && !dialog.open)
        {
            dialog.showModal();
        }

        if (!open && dialog.open)
        {
            dialog.close();
        }
    }, [ open ]);

    return (
        <dialog
            ref={ ref }
            className="m-auto w-[min(36rem,calc(100vw-2rem))] max-w-none rounded-panel border border-edge bg-panel p-0 text-ink shadow-lift backdrop:bg-black/70"
            aria-label={ title }
            onClose={ onClose }
        >
            <header className="flex items-start justify-between gap-3 border-b border-edge-soft px-4 py-3.5">
                <div className="grid min-w-0 gap-1">
                    <h2 className="m-0 text-[15px] font-medium">{ title }</h2>
                    { sub !== undefined && <p className="m-0 text-[13px] text-ink-3">{ sub }</p> }
                </div>

                <button className={ CLASS_ICON_BUTTON } type="button" aria-label="Close" onClick={ onClose }>
                    <X size={ 16 } aria-hidden="true" />
                </button>
            </header>

            <div className="max-h-[70dvh] overflow-y-auto p-4">{ children }</div>
        </dialog>
    );
}
