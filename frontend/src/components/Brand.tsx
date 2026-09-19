import { Link } from 'react-router';

/**
 * Logo mark plus wordmark. The mark is drawn rather than imported so it scales
 * and inherits `currentColor` with the rest of the chrome.
 */
export function Brand()
{
    return (
        <Link className="brand" to="/" aria-label="Nura, back to sign in">
            <svg className="brand__mark" viewBox="0 0 32 32" role="presentation" focusable="false">
                <path
                    d="M6 25V9.5a1 1 0 0 1 1.75-.66L24 27"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                />
                <path
                    d="M26 7v15.5a1 1 0 0 1-1.75.66L8 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    opacity="0.55"
                />
            </svg>

            <span className="brand__word">Nura</span>
        </Link>
    );
}
