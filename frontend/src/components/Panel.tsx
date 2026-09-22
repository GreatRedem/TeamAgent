import type { HTMLAttributes, ReactNode } from 'react';

import { MonoLabel } from './MonoLabel';

/**
 * The surface everything sits on: `--nura-panel` fill, 1px `--nura-line`
 * border, 12px radius. A header row and a footer row are separated from the
 * body by `--nura-line-soft`.
 *
 * The body is padded by default; a panel whose body is a list of rows passes
 * `flush`, because the rows carry their own padding and dividers and a padded
 * wrapper would put a gutter around a table.
 */
export function Panel({ title, eyebrow, sub, actions, footer, flush = false, className, children, ...rest }: {
    title?: ReactNode;
    /** A mono label above the title, e.g. `ACTIVITY · 12 WEEKS`. */
    eyebrow?: string;
    sub?: ReactNode;
    /** Sits at the right of the header row: a link, a button, a count. */
    actions?: ReactNode;
    /** Usually a `PaginationFooter`; it draws its own top rule. */
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

/**
 * The heading of a screen: what this is, one line of context, and the one
 * action that belongs to the whole page rather than to a panel on it.
 */
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
