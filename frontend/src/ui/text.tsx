import type * as React from 'react';

import { cn } from '@/libs/cn';

const textType = {
    Title: 'text-page font-semibold tracking-tight',
    Heading: 'text-base font-semibold',
    Foreground: '',
    ForegroundMuted: 'text-muted-foreground',
    Strong: 'font-medium',
    Body: 'text-sm',
    BodyStrong: 'text-sm font-medium',
    BodyMuted: 'text-sm text-muted-foreground',
    Caption: 'text-2xs text-muted-foreground',
    Mono: 'font-mono',
    Data: 'font-mono text-2xs',
    DataMuted: 'font-mono text-2xs text-muted-foreground',
    DataDestructive: 'font-mono text-2xs text-destructive',
    DataBody: 'font-mono text-sm',
    DataStrong: 'font-mono text-sm font-semibold',
    Stat: 'font-mono text-stat font-medium',
};

type TextType = keyof typeof textType;

const textElement: Partial<Record<TextType, 'h1' | 'h2'>> = {
    Title: 'h1',
    Heading: 'h2',
};

// Every piece of UI copy goes through here: `type` picks the typography, `as` the element.
// It takes a `message` and never children, so copy cannot nest markup.
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
