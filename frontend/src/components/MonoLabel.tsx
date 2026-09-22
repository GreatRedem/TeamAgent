import type { HTMLAttributes } from 'react';

/**
 * The label every machine value wears: nonces, token counts, latency, file
 * paths, handles, addresses, timestamps, section eyebrows.
 *
 * 10px JetBrains Mono, wide-tracked, uppercase, in the caption grey -- the
 * `.nura-label` rule from `tokens.css`. It is the main thing that makes the
 * interface read as an instrument and not a website, so it is one component
 * rather than a class name typed by hand in twenty places.
 */
export function MonoLabel({ className, ...rest }: HTMLAttributes<HTMLSpanElement>)
{
    return <span className={ [ 'nura-label', className ].filter(Boolean).join(' ') } { ...rest } />;
}
