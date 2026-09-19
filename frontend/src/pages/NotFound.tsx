import { ArrowLeft } from 'lucide-react';

import { ButtonLink } from '../components/Button';

export function NotFound()
{
    return (
        <section className="hero">
            <h1 className="hero__title">Page not found</h1>

            <p className="hero__subtitle">That page does not exist.</p>

            <ButtonLink to="/" icon={ <ArrowLeft size={ 18 } aria-hidden="true" /> }>
                Back to sign in
            </ButtonLink>
        </section>
    );
}
