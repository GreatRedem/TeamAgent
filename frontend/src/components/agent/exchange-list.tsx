import { useState } from 'react';

import type { AgentExchange } from '@/apis';
import { cn } from '@/libs/cn';
import { PROBE_TONE } from '@/libs/constant';
import { dateTimeLabel, durationLabel, numberLabel } from '@/libs/format';
import { t, tn } from '@/libs/i18n';
import { CodeBlock } from '@/ui/code-block';
import { Pressable } from '@/ui/pressable';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function ExchangeList({
    exchanges,
    empty,
    showAgent = false,
}: {
    exchanges: AgentExchange[];
    empty: string;
    showAgent?: boolean;
}) {
    const [open, setOpen] = useState<number | null>(null);

    if (exchanges.length === 0) {
        return <Text type="BodyMuted" className="px-5 py-5" message={empty} />;
    }

    return (
        <Stack direction="Vertical" as="ul" className="m-0 max-h-125 list-none overflow-y-auto p-0">
            {exchanges.map((exchange) => {
                const about = exchange.tokens_estimated ? '~' : '';
                const tokens =
                    exchange.prompt_tokens + exchange.completion_tokens > 0
                        ? t('agents.tokensInOut', {
                              prompt: `${about}${numberLabel(exchange.prompt_tokens)}`,
                              completion: `${about}${numberLabel(exchange.completion_tokens)}`,
                          })
                        : t('agents.exchanges.noTokens');
                const what = tn('agents.exchanges.round', exchange.tool_calls, {
                    round: exchange.round,
                });
                const outcome = t(
                    exchange.outcome === 'ok' ? 'agents.exchanges.ok' : 'agents.exchanges.failed',
                );

                return (
                    <Stack
                        direction="Vertical"
                        as="li"
                        className="border-b last:border-b-0"
                        key={exchange.id}>
                        <Pressable
                            className="flex w-full items-center gap-3 border-0 bg-transparent px-5 py-3 hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                            onClick={() =>
                                setOpen((current) => (current === exchange.id ? null : exchange.id))
                            }>
                            <Text
                                type="DataMuted"
                                as="time"
                                className="shrink-0"
                                dateTime={exchange.created_at}
                                message={dateTimeLabel(exchange.created_at, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            />

                            <Text
                                type="Body"
                                as="span"
                                className="min-w-0 grow truncate"
                                message={
                                    showAgent
                                        ? t('agents.exchanges.withAgent', {
                                              agent:
                                                  exchange.agent_name === ''
                                                      ? t('agents.exchanges.removedAgent')
                                                      : exchange.agent_name,
                                              what,
                                          })
                                        : what
                                }
                            />

                            <Text
                                type="DataMuted"
                                as="span"
                                className="hidden shrink-0 md:block"
                                message={tokens}
                            />

                            <Text
                                type="DataMuted"
                                as="span"
                                className="shrink-0"
                                message={durationLabel(exchange.duration_ms)}
                            />

                            <Text
                                type="BodyStrong"
                                as="span"
                                className={cn(
                                    'shrink-0',
                                    PROBE_TONE[exchange.outcome === 'ok' ? 'ok' : 'error'],
                                )}
                                message={
                                    exchange.reason === ''
                                        ? outcome
                                        : t('agents.exchanges.withReason', {
                                              outcome,
                                              reason: exchange.reason,
                                          })
                                }
                            />
                        </Pressable>

                        {open === exchange.id && (
                            <Stack direction="Vertical" className="gap-3 bg-muted/30 px-5 py-4">
                                <Text
                                    type="DataMuted"
                                    message={
                                        exchange.tokens_estimated
                                            ? t('agents.exchanges.estimated', { tokens })
                                            : tokens
                                    }
                                />

                                <Stack direction="Vertical" className="gap-1.5">
                                    <Text type="BodyMuted" message={t('agents.exchanges.sent')} />
                                    <CodeBlock className="max-h-64" message={exchange.request} />
                                </Stack>

                                <Stack direction="Vertical" className="gap-1.5">
                                    <Text
                                        type="BodyMuted"
                                        message={t('agents.exchanges.cameBack')}
                                    />
                                    <CodeBlock className="max-h-64" message={exchange.response} />
                                </Stack>
                            </Stack>
                        )}
                    </Stack>
                );
            })}
        </Stack>
    );
}
