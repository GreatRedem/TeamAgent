import { type ReactNode, useId } from 'react';

import { FieldDescription, FieldError, FieldLabel, Field as FieldRoot } from '@/ui/field';

export function Field({
    label,
    hint,
    error,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    children: (id: string) => ReactNode;
}) {
    const id = useId();

    return (
        <FieldRoot data-invalid={error === undefined ? undefined : true}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>

            {children(id)}

            {error !== undefined && <FieldError>{error}</FieldError>}

            {error === undefined && hint !== undefined && (
                <FieldDescription>{hint}</FieldDescription>
            )}
        </FieldRoot>
    );
}
