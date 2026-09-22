import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({ icon: Icon, title, description, action }: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
})
{
    return (
        <div className="grid justify-items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon size={ 18 } aria-hidden="true" />
            </span>

            <div className="grid gap-1">
                <p className="m-0 font-medium">{ title }</p>
                { description !== undefined && <p className="m-0 max-w-[48ch] text-sm text-muted-foreground">{ description }</p> }
            </div>

            { action }
        </div>
    );
}
