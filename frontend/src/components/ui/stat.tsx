import { cn } from 'cn';
import type { ReactNode } from 'react';

export function Stat({
    label,
    value,
    unit,
    note,
    meter,
    tone = 'primary',
}: {
    label: string;
    value: ReactNode;
    unit?: string;
    note?: string;
    meter?: number;
    tone?: 'primary' | 'warning' | 'destructive';
}) {
    const fill =
        tone === 'destructive'
            ? 'bg-destructive'
            : tone === 'warning'
              ? 'bg-warning'
              : 'bg-primary';

    return (
        <div className="grid content-start gap-2 rounded-lg border bg-muted/40 px-4 py-3.5">
            <p className="m-0 text-sm text-muted-foreground">{label}</p>

            <p className="m-0 font-mono text-stat leading-none font-medium">
                {value}
                {unit !== undefined && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
                )}
            </p>

            {meter !== undefined && (
                <div className="h-1 overflow-hidden rounded-full bg-well" aria-hidden="true">
                    <span
                        className={cn(
                            'block h-full rounded-full transition-[width] duration-500',
                            fill,
                        )}
                        style={{ inlineSize: `${Math.min(100, Math.max(0, meter))}%` }}
                    />
                </div>
            )}

            {note !== undefined && <p className="m-0 text-2xs text-muted-foreground">{note}</p>}
        </div>
    );
}
