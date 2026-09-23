import { useState } from 'react';

import type { AgentExchange } from '@/apis';
import { cn } from '@/libs/cn';
import { PROBE_TONE } from '@/libs/constant';
import { durationLabel } from '@/libs/format';
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
        <Stack direction="Vertical" as="ul" className="m-0 list-none p-0">
            {exchanges.map((exchange) => {
                const about = exchange.tokens_estimated ? '~' : '';
                const tokens =
                    exchange.prompt_tokens + exchange.completion_tokens > 0
                        ? `${about}${exchange.prompt_tokens.toLocaleString()} in · ${about}${exchange.completion_tokens.toLocaleString()} out`
                        : 'No tokens';
                const what = `Round ${exchange.round}, ${exchange.tool_calls} tool call${exchange.tool_calls === 1 ? '' : 's'}`;

                return (
                    <Stack
                        direction="Vertical"
                        as="li"
                        className="border-b last:border-b-0"
                        key={exchange.id}>
                        <Pressable
                            className="flex w-full items-center gap-3 border-0 bg-transparent px-5 py-3 hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                            aria-expanded={open === exchange.id}
                            onClick={() =>
                                setOpen((current) => (current === exchange.id ? null : exchange.id))
                            }>
                            <Text
                                type="DataMuted"
                                as="time"
                                className="shrink-0"
                                dateTime={exchange.created_at}
                                message={new Date(exchange.created_at).toLocaleString(undefined, {
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
                                        ? `${exchange.agent_name === '' ? 'Removed agent' : exchange.agent_name} · ${what}`
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
                                message={`${exchange.outcome === 'ok' ? 'OK' : 'Failed'}${exchange.reason === '' ? '' : ` · ${exchange.reason}`}`}
                            />
                        </Pressable>

                        {open === exchange.id && (
                            <Stack direction="Vertical" className="gap-3 bg-muted/30 px-5 py-4">
                                <Text
                                    type="DataMuted"
                                    message={
                                        exchange.tokens_estimated
                                            ? `${tokens}, estimated: the provider gave no count`
                                            : tokens
                                    }
                                />

                                <Stack direction="Vertical" className="gap-1.5">
                                    <Text type="BodyMuted" message="Sent" />
                                    <CodeBlock className="max-h-64" message={exchange.request} />
                                </Stack>

                                <Stack direction="Vertical" className="gap-1.5">
                                    <Text type="BodyMuted" message="Came back" />
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
