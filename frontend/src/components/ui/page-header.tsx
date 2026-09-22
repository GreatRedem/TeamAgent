import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
})
{
    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid min-w-0 gap-1">
                <h1 className="m-0 text-page font-semibold tracking-tight">{ title }</h1>
                { description !== undefined && <p className="m-0 max-w-[60ch] text-muted-foreground">{ description }</p> }
            </div>

            { actions !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{ actions }</div> }
        </header>
    );
}
