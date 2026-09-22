import { LED_FILL } from '../../lib/constant';

export type LedState = 'live' | 'degraded' | 'off';

export function LED({ state, label }: { state: LedState; label?: string })
{
    return (
        <span
            className={ `inline-block size-1.5 shrink-0 rounded-full ${ LED_FILL[state] }` }
            role={ label === undefined ? undefined : 'img' }
            aria-label={ label }
            aria-hidden={ label === undefined ? true : undefined }
        />
    );
}
