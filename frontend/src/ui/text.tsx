import type * as React from 'react';

import { cn } from '@/libs/cn';

const textType = {
    Title: 'text-page font-semibold tracking-tight leading-display',
    Heading: 'text-base font-semibold leading-heading',
    Foreground: '',
    ForegroundMuted: 'text-muted-foreground',
    Strong: 'font-medium',
    Body: 'text-sm leading-body',
    BodyStrong: 'text-sm font-medium leading-body',
    BodyMuted: 'text-sm text-muted-foreground leading-body',
    Caption: 'text-2xs text-muted-foreground leading-body',
    Mono: 'font-mono',
    Data: 'font-mono text-2xs leading-body',
    DataMuted: 'font-mono text-2xs text-muted-foreground leading-body',
    DataDestructive: 'font-mono text-2xs text-destructive leading-body',
    DataBody: 'font-mono text-sm leading-body',
    DataStrong: 'font-mono text-sm font-semibold leading-body',
    Stat: 'font-mono text-stat font-medium leading-display',
};

type TextType = keyof typeof textType;

const textElement: Partial<Record<TextType, 'h1' | 'h2'>> = {
    Title: 'h1',
    Heading: 'h2',
};

function Text({
    type,
    message,
    as,
    className,
    ...props
}: Omit<React.AllHTMLAttributes<HTMLElement>, 'children' | 'type' | 'as'> & {
    type: TextType;
    message: string | number;
    as?: 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'dt' | 'dd' | 'label' | 'div' | 'time' | 'output';
}) {
    const Comp = as ?? textElement[type] ?? 'p';

    return (
        <Comp
            data-slot="text"
            data-type={type}
            className={cn('m-0', textType[type], className)}
            {...props}>
            {message}
        </Comp>
    );
}

export { Text, type TextType };
