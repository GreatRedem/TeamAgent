export type LedState = 'live' | 'degraded' | 'off';

/**
 * Teal lit = live, brass = degraded, grey = paused or unknown.
 *
 * There is deliberately no red state. A failure gets words next to it (the
 * probe text, the failure chip); the LED only says whether something is
 * running, and a busy-but-broken thing is a contradiction the LED cannot show.
 */
const FILL: Record<LedState, string> = {
    live: 'bg-live ring-3 ring-live/15',
    degraded: 'bg-pending',
    off: 'bg-off'
};

export function LED({ state, label }: {
    state: LedState;
    /** Read out by screen readers; without it the dot is decoration. */
    label?: string;
})
{
    return (
        <span
            className={ `inline-block size-1.5 shrink-0 rounded-full ${ FILL[state] }` }
            role={ label === undefined ? undefined : 'img' }
            aria-label={ label }
            aria-hidden={ label === undefined ? true : undefined }
        />
    );
}
