import type { ReactNode } from 'react';

import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function PageHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <Stack
            direction="Horizontal"
            as="header"
            className="flex-wrap items-end justify-between gap-4">
            <Stack direction="Vertical" className="min-w-0 gap-1">
                <Text type="Title" message={title} />
                {description !== undefined && (
                    <Text type="ForegroundMuted" className="max-w-[60ch]" message={description} />
                )}
            </Stack>

            {actions !== undefined && (
                <Stack direction="Horizontal" className="shrink-0 flex-wrap items-center gap-2">
                    {actions}
                </Stack>
            )}
        </Stack>
    );
}
