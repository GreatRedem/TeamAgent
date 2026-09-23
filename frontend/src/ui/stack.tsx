import type * as React from 'react';

import { cn } from '@/libs/cn';

const stackDirection = {
    Horizontal: 'flex-row',
    Vertical: 'flex-col',
};

type StackElement =
    | 'div'
    | 'span'
    | 'section'
    | 'header'
    | 'footer'
    | 'nav'
    | 'main'
    | 'aside'
    | 'form'
    | 'ul'
    | 'li';

function Stack({
    direction,
    as: Comp = 'div',
    className,
    ref,
    ...props
}: Omit<React.AllHTMLAttributes<HTMLElement>, 'as'> & {
    direction: keyof typeof stackDirection;
    as?: StackElement;
    ref?: React.Ref<HTMLElement>;
}) {
    return (
        <Comp
            ref={ref as React.Ref<never>}
            data-slot="stack"
            data-direction={direction}
            className={cn('flex', stackDirection[direction], className)}
            {...props}
        />
    );
}

export { Stack };
