import type { ExchangeUsage } from '@/apis';
import { Stat } from '@/components/stat';
import { compactCount, dateLabel, durationLabel, timeLabel } from '@/libs/format';
import { t } from '@/libs/i18n';
import { Stack } from '@/ui/stack';

export function UsageStats({ usage, who }: { usage: ExchangeUsage; who: string }) {
    return (
        <Stack direction="Vertical" className="gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            <Stat
                label={t('models.stats.replies')}
                value={compactCount(usage.replies)}
                note={t('models.stats.roundTrips', { count: usage.round_trips })}
            />
            <Stat
                label={t('models.stats.tokensIn')}
                value={compactCount(usage.prompt_tokens)}
                note={t('models.stats.tokensRead', { count: usage.prompt_tokens })}
            />
            <Stat
                label={t('models.stats.tokensOut')}
                value={compactCount(usage.completion_tokens)}
                note={t('models.stats.tokensWritten', { count: usage.completion_tokens })}
            />
            <Stat
                label={t('models.stats.failures')}
                value={compactCount(usage.failures)}
                note={
                    usage.round_trips === 0
                        ? t('models.stats.nothingSent')
                        : t('models.stats.failureShare', {
                              percent: Math.round((usage.failures / usage.round_trips) * 100),
                          })
                }
            />
            <Stat
                label={t('models.stats.average')}
                value={usage.average_ms === 0 ? '–' : durationLabel(usage.average_ms)}
                note={t('models.stats.averageNote')}
            />
            <Stat
                label={t('models.stats.toolCalls')}
                value={compactCount(usage.tool_calls)}
                note={t('models.stats.toolCallsNote')}
            />
            <Stat
                label={t('models.stats.lastUsed')}
                value={
                    usage.last_used_at === null
                        ? t('models.stats.never')
                        : dateLabel(usage.last_used_at)
                }
                note={
                    usage.last_used_at === null
                        ? t('models.stats.notCalled', { who })
                        : timeLabel(usage.last_used_at)
                }
            />
        </Stack>
    );
}
