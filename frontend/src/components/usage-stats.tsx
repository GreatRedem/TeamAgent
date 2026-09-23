import type { ExchangeUsage } from '@/apis';
import { Stat } from '@/components/stat';
import { compactCount, durationLabel } from '@/libs/format';
import { Stack } from '@/ui/stack';

export function UsageStats({ usage, who }: { usage: ExchangeUsage; who: string }) {
    return (
        <Stack direction="Vertical" className="gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            <Stat
                label="Replies"
                value={compactCount(usage.replies)}
                note={`${usage.round_trips.toLocaleString()} round-trips in all`}
            />
            <Stat
                label="Tokens in"
                value={compactCount(usage.prompt_tokens)}
                note={`${usage.prompt_tokens.toLocaleString()} read`}
            />
            <Stat
                label="Tokens out"
                value={compactCount(usage.completion_tokens)}
                note={`${usage.completion_tokens.toLocaleString()} written`}
            />
            <Stat
                label="Failures"
                value={compactCount(usage.failures)}
                note={
                    usage.round_trips === 0
                        ? 'Nothing sent yet'
                        : `${Math.round((usage.failures / usage.round_trips) * 100)}% of round-trips`
                }
            />
            <Stat
                label="Average answer"
                value={usage.average_ms === 0 ? '–' : durationLabel(usage.average_ms)}
                note="Over the calls that succeeded"
            />
            <Stat
                label="Tool calls"
                value={compactCount(usage.tool_calls)}
                note="Asked for during replies"
            />
            <Stat
                label="Last used"
                value={
                    usage.last_used_at === null
                        ? 'Never'
                        : new Date(usage.last_used_at).toLocaleDateString()
                }
                note={
                    usage.last_used_at === null
                        ? `${who} has not been called yet`
                        : new Date(usage.last_used_at).toLocaleTimeString()
                }
            />
        </Stack>
    );
}
