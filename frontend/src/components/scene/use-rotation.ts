import { useEffect, useState } from 'react';

import { SCENE_FRAME, SCENE_PERIOD } from '@/libs/constant';

export function useRotation(): number {
    const [angle, setAngle] = useState(0);

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');

        if (query.matches) {
            return;
        }

        let frame = 0;
        let last = 0;

        const tick = (now: number) => {
            frame = requestAnimationFrame(tick);

            if (now - last < SCENE_FRAME) {
                return;
            }

            last = now;

            setAngle(((now % SCENE_PERIOD) / SCENE_PERIOD) * Math.PI * 2);
        };

        frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(frame);
    }, []);

    return angle;
}
