import { ArrowLeft } from 'lucide-react';

import { Button } from '@/ui/button';
import { Text } from '@/ui/text';

export function NotFound() {
    return (
        <section className="mx-auto grid w-full max-w-sm justify-items-center gap-4 text-center">
            <Text type="DataMuted" message="404" />

            <Text type="Title" message="This page does not exist" />

            <Text
                type="ForegroundMuted"
                message="Check the address, or head back to where you started."
            />

            <Button variant="outline" link="/" icon={<ArrowLeft />} message="Back to sign in" />
        </section>
    );
}
