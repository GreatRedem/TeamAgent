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

// Every layout box goes through here: `direction` picks the axis, `as` the element.
// There is no raw <div> outside src/ui; a wrapper with no layout of its own is Vertical,
// which lays its children out the way block flow would.
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
            // The element is only known at runtime, so the ref is typed as the common base.
            ref={ref as React.Ref<never>}
            data-slot="stack"
            data-direction={direction}
            className={cn('flex', stackDirection[direction], className)}
            {...props}
        />
    );
}

export { Stack };
