import { ArrowLeft } from 'lucide-react';
import { numberLabel } from '@/libs/format';
import { t } from '@/libs/i18n';
import { Button } from '@/ui/button';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function NotFound() {
    return (
        <Stack
            direction="Vertical"
            as="section"
            className="mx-auto w-full max-w-sm items-center gap-4 text-center">
            <Text type="DataMuted" message={numberLabel(404)} />

            <Text type="Title" message={t('layout.notFound.title')} />

            <Text type="ForegroundMuted" message={t('layout.notFound.description')} />

            <Button
                variant="outline"
                link="/"
                icon={<ArrowLeft className="rtl:-scale-x-100" />}
                message={t('layout.notFound.back')}
            />
        </Stack>
    );
}
