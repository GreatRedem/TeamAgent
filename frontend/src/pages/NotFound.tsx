import { ArrowLeft } from 'lucide-react';

import { ButtonLink } from '../components/Button';

export function NotFound()
{
    return (
        <section className="mx-auto flex min-h-[60dvh] w-full max-w-lg flex-col items-center justify-center text-center">
            <h1 className="m-0 text-4xl font-bold tracking-tight">Page not found</h1>

            <p className="mt-3 mb-8 text-base text-ink-2">That page does not exist.</p>

            <ButtonLink to="/" icon={ <ArrowLeft size={ 18 } aria-hidden="true" /> }>
                Back to sign in
            </ButtonLink>
        </section>
    );
}
