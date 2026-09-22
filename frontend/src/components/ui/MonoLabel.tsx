import type { HTMLAttributes } from 'react';

import { CLASS_MONO_LABEL } from '../../lib/constant';

export function MonoLabel({ className, ...rest }: HTMLAttributes<HTMLSpanElement>)
{
    return <span className={ [ CLASS_MONO_LABEL, className ].filter(Boolean).join(' ') } { ...rest } />;
}
