import type { ReactNode } from 'react';

import { MonoLabel } from './MonoLabel';

export function StatTile({ label, value, unit, note, meter, tone = 'live' }: {
    label: string;
    value: ReactNode;
    unit?: string;
    note?: string;
    meter?: number;
    tone?: 'live' | 'pending' | 'fail';
})
{
    const fill = tone === 'fail' ? 'bg-fail' : tone === 'pending' ? 'bg-pending' : 'bg-live';

    return (
        <div className="grid content-start gap-2 rounded-control border border-edge bg-raised px-3.5 py-3">
            <MonoLabel>{ label }</MonoLabel>

            <p className="m-0 font-mono text-[26px] leading-none font-medium text-ink">
                { value }
                { unit !== undefined && <span className="ms-1 text-[13px] text-ink-3">{ unit }</span> }
            </p>

            { meter !== undefined && (
                <div className="h-1.5 overflow-hidden rounded-chip bg-well" aria-hidden="true">
                    <span className={ `block h-full ${ fill }` } style={ { inlineSize: `${ Math.min(100, Math.max(0, meter)) }%` } } />
                </div>
            ) }

            { note !== undefined && <p className="m-0 text-[12px] text-ink-3">{ note }</p> }
        </div>
    );
}
