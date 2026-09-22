import { Link } from 'react-router';

export function Brand({ to = '/' }: { to?: string })
{
    return (
        <Link
            className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-live text-live-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
            to={ to }
            aria-label={ to === '/' ? 'Nura, back to sign in' : 'Nura, back to your projects' }
        >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 12.5V3.5l9 9v-9" />
            </svg>
        </Link>
    );
}
