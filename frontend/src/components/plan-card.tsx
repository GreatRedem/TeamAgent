import type { ReactNode } from 'react';

import type { AccountMe } from '@/apis';
import { PlanLimits } from '@/components/plan-limits';
import { PLAN_TEXT } from '@/libs/constant';
import { dateLabel } from '@/libs/format';
import { t } from '@/libs/i18n';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { DataList, DataRow } from '@/ui/data-value';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

function planNote(me: AccountMe): string {
    if (me.chosen_plan !== me.plan && me.plan_until !== null) {
        return t('plans.card.lapsed', {
            plan: t(PLAN_TEXT[me.chosen_plan].name),
            date: dateLabel(me.plan_until),
        });
    }

    if (me.plan === 'free') {
        return t('plans.card.free');
    }

    return me.plan_until === null
        ? t('plans.card.noEnd')
        : t('plans.card.until', { date: dateLabel(me.plan_until) });
}

export function PlanCard({ me, action }: { me: AccountMe; action?: ReactNode }) {
    const lapsed = me.chosen_plan !== me.plan && me.plan_until !== null;

    return (
        <Card signal={lapsed ? 'degraded' : undefined}>
            <CardHeader>
                <CardTitle>{t('plans.card.title')}</CardTitle>
            </CardHeader>

            <CardContent>
                <Stack direction="Vertical" className="gap-4">
                    <Stack direction="Vertical" className="gap-1">
                        <Text type="Heading" message={t(PLAN_TEXT[me.plan].name)} />
                        <Text type="BodyMuted" message={planNote(me)} />
                    </Stack>

                    <DataList>
                        <DataRow
                            label={t('plans.card.projects')}
                            value={
                                me.limits === null
                                    ? t('plans.card.unlimited', { used: me.projects })
                                    : t('plans.card.used', {
                                          used: me.projects,
                                          limit: me.limits.projects,
                                      })
                            }
                        />
                    </DataList>

                    <PlanLimits limits={me.limits} />
                </Stack>
            </CardContent>

            {action !== undefined && <CardFooter>{action}</CardFooter>}
        </Card>
    );
}
