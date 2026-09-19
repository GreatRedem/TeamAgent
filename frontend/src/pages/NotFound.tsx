import { Link } from 'react-router';

export function NotFound()
{
    return (
        <>
            <p className="subtitle">
                That page does not exist.
            </p>

            <Link className="button" to="/">
                Back to sign in
            </Link>
        </>
    );
}
