import type { TaskRunEvent } from '@/apis';
import { cn } from '@/libs/cn';
import { durationLabel } from '@/libs/format';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

function describe(event: TaskRunEvent): { line: string; ok: boolean } {
    switch (event.kind) {
        case 'start':
            return { line: `Started ${event.agent} on ${event.model}`, ok: true };
        case 'recipient':
            return { line: `The result is for ${event.name}`, ok: true };
        case 'model': {
            const about = event.estimated ? '~' : '';
            const tools =
                event.tool_calls === 0
                    ? ''
                    : `, asked for ${event.tool_calls} tool${event.tool_calls === 1 ? '' : 's'}`;

            return {
                line: `Round ${event.round}: ${event.model} ${event.ok ? 'answered' : 'failed'} in ${durationLabel(event.duration_ms)}, ${about}${event.prompt_tokens.toLocaleString()} in · ${about}${event.completion_tokens.toLocaleString()} out${tools}${event.reason === '' ? '' : ` (${event.reason})`}`,
                ok: event.ok,
            };
        }
        case 'tool':
            return {
                line: `Tool ${event.name} ${event.ok ? 'worked' : 'failed'} in ${durationLabel(event.duration_ms)}`,
                ok: event.ok,
            };
        case 'send':
            return {
                line: event.ok
                    ? `Sent to ${event.to} through ${event.bot}`
                    : event.bot === ''
                      ? `Could not send to ${event.to}: they have not written to any bot here`
                      : `Telegram would not take it for ${event.to} through ${event.bot}`,
                ok: event.ok,
            };
        case 'end':
            return {
                line: `Finished: ${event.outcome === 'ok' ? 'done' : 'failed'}${event.reason === '' ? '' : `, ${event.reason}`}`,
                ok: event.outcome === 'ok',
            };
    }
}

export function TaskRunLog({ startedAt, events }: { startedAt: string; events: TaskRunEvent[] }) {
    const origin = new Date(startedAt).getTime();

    if (events.length === 0) {
        return <Text type="BodyMuted" message="No steps recorded yet." />;
    }

    return (
        <Stack direction="Vertical" as="ul" className="m-0 list-none gap-2 p-0">
            {events.map((event, index) => {
                const { line, ok } = describe(event);
                const offset = Math.max(0, new Date(event.at).getTime() - origin);

                return (
                    <Stack
                        direction="Horizontal"
                        as="li"
                        className="items-baseline gap-3"
                        // biome-ignore lint/suspicious/noArrayIndexKey: steps are only ever appended, so a step keeps its place and its index
                        key={index}>
                        <Text
                            type="DataMuted"
                            as="span"
                            className="w-14 shrink-0 text-end"
                            message={`+${(offset / 1000).toFixed(1)}s`}
                        />
                        <Stack direction="Vertical" as="span" className="min-w-0 gap-1">
                            <Text
                                type="Body"
                                as="span"
                                className={cn(!ok && 'text-destructive')}
                                message={line}
                            />
                            {event.kind === 'tool' && (
                                <>
                                    <Text
                                        type="DataMuted"
                                        as="span"
                                        className="break-anywhere"
                                        message={`asked: ${event.args}`}
                                    />
                                    <Text
                                        type="DataMuted"
                                        as="span"
                                        className="break-anywhere"
                                        message={`gave: ${event.result}`}
                                    />
                                </>
                            )}
                        </Stack>
                    </Stack>
                );
            })}
        </Stack>
    );
}
