import { Check } from 'lucide-react';

import type { PlanLimits as Limits } from '@/apis';
import { t, tn } from '@/libs/i18n';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function PlanLimits({ limits }: { limits: Limits | null }) {
    const lines =
        limits === null
            ? [t('plans.limit.custom')]
            : [
                  tn('plans.limit.projects', limits.projects),
                  tn('plans.limit.agents', limits.agents),
                  tn('plans.limit.bots', limits.bots),
                  tn('plans.limit.tasks', limits.tasks),
              ];

    return (
        <Stack direction="Vertical" as="ul" className="m-0 list-none gap-2 p-0">
            {lines.map((line) => (
                <Stack direction="Horizontal" as="li" key={line} className="items-center gap-2">
                    <Check size={14} className="shrink-0 text-primary" />
                    <Text type="Body" message={line} />
                </Stack>
            ))}
        </Stack>
    );
}
