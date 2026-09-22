import { Switch } from './switch';

export function CapabilityRow({ id, label, description, granted, busy, onToggle }: {
    id: string;
    label: string;
    description: string;
    granted: boolean;
    busy: boolean;
    onToggle: () => void;
})
{
    return (
        <div className="flex min-h-14 items-center justify-between gap-4 border-b py-3 last:border-b-0">
            <div className="grid min-w-0 gap-0.5">
                <label className="font-mono text-2xs text-foreground" htmlFor={ id }>{ label }</label>
                <p className="m-0 text-sm text-muted-foreground">{ description }</p>
            </div>

            <Switch id={ id } checked={ granted } disabled={ busy } onCheckedChange={ onToggle } />
        </div>
    );
}
