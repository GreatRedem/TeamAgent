import type { HTMLAttributes, ReactNode } from 'react';

import { MonoLabel } from './MonoLabel';

export function Panel({ title, eyebrow, sub, actions, footer, flush = false, className, children, ...rest }: {
    title?: ReactNode;
    eyebrow?: string;
    sub?: ReactNode;
    actions?: ReactNode;
    footer?: ReactNode;
    flush?: boolean;
    className?: string;
    children: ReactNode;
} & HTMLAttributes<HTMLElement>)
{
    return (
        <section className={ [ 'flex flex-col rounded-panel border border-edge bg-panel', className ].filter(Boolean).join(' ') } { ...rest }>
            { title !== undefined && (
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge-soft px-4 py-3.5">
                    <div className="grid min-w-0 gap-1">
                        { eyebrow !== undefined && <MonoLabel>{ eyebrow }</MonoLabel> }
                        <h2 className="m-0 text-[15px] font-medium">{ title }</h2>
                        { sub !== undefined && <p className="m-0 text-[13px] text-ink-3">{ sub }</p> }
                    </div>

                    { actions }
                </header>
            ) }

            <div className={ flush ? undefined : 'p-4' }>{ children }</div>

            { footer }
        </section>
    );
}

export function PageHead({ title, sub, actions }: {
    title: ReactNode;
    sub?: ReactNode;
    actions?: ReactNode;
})
{
    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid min-w-0 gap-1.5">
                <h1 className="m-0 text-[26px] font-semibold tracking-tight">{ title }</h1>
                { sub !== undefined && <p className="m-0 text-[13px] text-ink-3">{ sub }</p> }
            </div>

            { actions }
        </div>
    );
}
