import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

export function NotFound() {
    return (
        <section className="mx-auto grid w-full max-w-sm justify-items-center gap-4 text-center">
            <p className="m-0 font-mono text-2xs text-muted-foreground">404</p>

            <h1 className="m-0 text-page font-semibold tracking-tight">This page does not exist</h1>

            <p className="m-0 text-muted-foreground">
                Check the address, or head back to where you started.
            </p>

            <Button asChild variant="outline">
                <Link to="/">
                    <ArrowLeft aria-hidden="true" />
                    Back to sign in
                </Link>
            </Button>
        </section>
    );
}
