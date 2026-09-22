import { Link } from 'react-router';

import { BRAND_SIZES, LOGO_SRC } from '@/libs/constant';

export function Brand({ to = '/', size = 'sm' }: { to?: string; size?: 'sm' | 'lg' }) {
    return (
        <Link
            className={`inline-flex shrink-0 overflow-hidden no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${BRAND_SIZES[size]}`}
            to={to}
            aria-label={to === '/' ? 'Nura, back to sign in' : 'Nura, back to your projects'}>
            <img src={LOGO_SRC} alt="" className="size-full object-cover" />
        </Link>
    );
}
