import { useEffect, useState } from 'react';

/** One turn every 24 seconds, inside the 15-30s the brief asks for. */
const PERIOD = 24_000;

/**
 * The rotation is slow enough that redrawing at 60fps buys nothing visible, so
 * it is throttled -- the whole solid re-renders each frame, and this keeps that
 * off the main thread's critical path on a phone.
 */
const FRAME = 1000 / 18;

/**
 * Drives the scene's rotation, in radians.
 *
 * Returns a fixed angle and never starts a loop when the viewer asks for
 * reduced motion; the scene is decorative, so the correct answer there is a
 * still image rather than a slower animation.
 */
export function useRotation(): number
{
    const [ angle, setAngle ] = useState(0);

    useEffect(() =>
    {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');

        if (query.matches)
        {
            return;
        }

        let frame = 0;
        let last = 0;

        const tick = (now: number) =>
        {
            frame = requestAnimationFrame(tick);

            if (now - last < FRAME)
            {
                return;
            }

            last = now;

            setAngle((now % PERIOD) / PERIOD * Math.PI * 2);
        };

        frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(frame);
    }, []);

    return angle;
}
