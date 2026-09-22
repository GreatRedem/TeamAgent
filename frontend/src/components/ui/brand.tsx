import { Link } from 'react-router';

export function Brand({ to = '/' }: { to?: string }) {
    return (
        <Link
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            to={to}
            aria-label={to === '/' ? 'Nura, back to sign in' : 'Nura, back to your projects'}
        >
            <svg
                width="15"
                height="15"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M3.5 12.5V3.5l9 9v-9" />
            </svg>
        </Link>
    );
}
