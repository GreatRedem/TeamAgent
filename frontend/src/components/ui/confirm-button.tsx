import { useEffect, useRef, useState } from 'react';

import { CONFIRM_TIMEOUT } from '@/lib/constant';
import { Button } from './button';

export function ConfirmButton({ label, confirmLabel, onConfirm, disabled, size = 'sm' }: {
    label: string;
    confirmLabel?: string;
    onConfirm: () => void;
    disabled?: boolean;
    size?: 'sm' | 'default';
})
{
    const [ armed, setArmed ] = useState(false);
    const timer = useRef(0);

    useEffect(() =>
    {
        if (!armed)
        {
            return;
        }

        timer.current = window.setTimeout(() => setArmed(false), CONFIRM_TIMEOUT);

        return () => window.clearTimeout(timer.current);
    }, [ armed ]);

    return (
        <Button
            type="button"
            size={ size }
            variant={ armed ? 'destructive' : 'ghost' }
            disabled={ disabled }
            aria-live="polite"
            className={ armed ? undefined : 'text-destructive hover:bg-destructive/10 hover:text-destructive' }
            onClick={ () =>
            {
                if (!armed)
                {
                    setArmed(true);

                    return;
                }

                setArmed(false);
                onConfirm();
            } }
        >
            { armed ? confirmLabel ?? `${ label }, confirm` : label }
        </Button>
    );
}
