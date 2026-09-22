import type { ReactNode } from 'react';
import { useId } from 'react';

import { Label } from './label';

export function Field({ label, hint, error, children }: {
    label: string;
    hint?: string;
    error?: string;
    children: (id: string) => ReactNode;
})
{
    const id = useId();
    const describedBy = error !== undefined ? `${ id }-error` : hint !== undefined ? `${ id }-hint` : undefined;

    return (
        <div className="grid gap-2">
            <Label htmlFor={ id }>{ label }</Label>

            <div aria-describedby={ describedBy } className="contents">{ children(id) }</div>

            { error !== undefined && (
                <p className="m-0 text-2xs text-destructive" id={ `${ id }-error` } role="alert">{ error }</p>
            ) }

            { error === undefined && hint !== undefined && (
                <p className="m-0 text-2xs leading-relaxed text-muted-foreground" id={ `${ id }-hint` }>{ hint }</p>
            ) }
        </div>
    );
}
