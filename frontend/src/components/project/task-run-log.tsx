import type { TaskRunEvent } from '@/apis';
import { cn } from '@/libs/cn';
import { durationLabel, numberLabel, timeLabel } from '@/libs/format';
import { locale, t, tn } from '@/libs/i18n';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

function describe(event: TaskRunEvent): { line: string; ok: boolean } {
    switch (event.kind) {
        case 'start':
            return {
                line: t('tasks.log.start', { agent: event.agent, model: event.model }),
                ok: true,
            };
        case 'recipient':
            return { line: t('tasks.log.recipient', { name: event.name }), ok: true };
        case 'model': {
            const about = event.estimated ? '~' : '';
            const round = t(event.ok ? 'tasks.log.model.answered' : 'tasks.log.model.failed', {
                round: event.round,
                model: event.model,
                duration: durationLabel(event.duration_ms),
                prompt: `${about}${numberLabel(event.prompt_tokens)}`,
                completion: `${about}${numberLabel(event.completion_tokens)}`,
            });
            const tools =
                event.tool_calls === 0
                    ? round
                    : tn('tasks.log.model.tools', event.tool_calls, { line: round });

            return {
                line:
                    event.reason === ''
                        ? tools
                        : t('tasks.log.withReason', { line: tools, reason: event.reason }),
                ok: event.ok,
            };
        }
        case 'tool':
            return {
                line: t(event.ok ? 'tasks.log.tool.worked' : 'tasks.log.tool.failed', {
                    name: event.name,
                    duration: durationLabel(event.duration_ms),
                }),
                ok: event.ok,
            };
        case 'send':
            return {
                line: event.ok
                    ? t('tasks.log.send.sent', { to: event.to, bot: event.bot })
                    : event.bot === ''
                      ? t('tasks.log.send.noBot', { to: event.to })
                      : t('tasks.log.send.rejected', { to: event.to, bot: event.bot }),
                ok: event.ok,
            };
        case 'switch':
            return {
                line: t('tasks.log.switch', { model: event.model }),
                ok: true,
            };
        case 'chain':
            return {
                line: t('tasks.log.chain', { titles: event.started.join(', ') }),
                ok: true,
            };
        case 'retry':
            return {
                line: t('tasks.log.retry', {
                    time: timeLabel(event.next_at),
                    attempt: event.attempt,
                    of: event.of,
                }),
                ok: true,
            };
        case 'end':
            return {
                line:
                    event.reason === ''
                        ? t(event.outcome === 'ok' ? 'tasks.log.end.done' : 'tasks.log.end.failed')
                        : t(
                              event.outcome === 'ok'
                                  ? 'tasks.log.end.doneReason'
                                  : 'tasks.log.end.failedReason',
                              { reason: event.reason },
                          ),
                ok: event.outcome === 'ok',
            };
    }
}

export function TaskRunLog({ startedAt, events }: { startedAt: string; events: TaskRunEvent[] }) {
    const origin = new Date(startedAt).getTime();

    if (events.length === 0) {
        return <Text type="BodyMuted" message={t('tasks.log.empty')} />;
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
                            message={t('tasks.log.offset', {
                                seconds: (offset / 1000).toLocaleString(locale, {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                    useGrouping: false,
                                }),
                            })}
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
                                        message={t('tasks.log.tool.args', { args: event.args })}
                                    />
                                    <Text
                                        type="DataMuted"
                                        as="span"
                                        className="break-anywhere"
                                        message={t('tasks.log.tool.result', {
                                            result: event.result,
                                        })}
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
