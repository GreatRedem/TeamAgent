import { useCallback, useEffect, useState } from 'react';

import { type AgentExchange, ApiError, modelExchanges, type Paged, type TeamModel } from '@/apis';
import { ExchangeList } from '@/components/agent/exchange-list';
import { Pager } from '@/components/pager';
import { UsageStats } from '@/components/usage-stats';
import { Alert, AlertDescription } from '@/ui/alert';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Skeleton } from '@/ui/skeleton';

// Everything one model has done: its totals, then every round-trip any agent made through it,
// newest first, each one opening to what was sent and what came back.
export function ModelUsageDialog({
    teamId,
    model,
    onOpenChange,
}: {
    teamId: number;
    model: TeamModel | null;
    onOpenChange: (open: boolean) => void;
}) {
    const [exchanges, setExchanges] = useState<AgentExchange[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modelId = model?.id;

    useEffect(() => {
        if (modelId === undefined) {
            return;
        }

        let active = true;

        setExchanges(null);
        setError(null);

        modelExchanges(teamId, modelId)
            .then((payload) => {
                if (active) {
                    setExchanges(payload.exchanges);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setExchanges([]);
                    setError(
                        cause instanceof ApiError
                            ? cause.result
                            : 'The round-trips could not be loaded.',
                    );
                }
            });

        return () => {
            active = false;
        };
    }, [teamId, modelId]);

    const goTo = useCallback(
        async (offset: number) => {
            if (modelId === undefined) {
                return;
            }

            setPaging(true);

            try {
                const next = await modelExchanges(teamId, modelId, { offset });

                setExchanges(next.exchanges);
                setPage(next);
            } catch (cause) {
                setError(
                    cause instanceof ApiError
                        ? cause.result
                        : 'The round-trips could not be loaded.',
                );
            } finally {
                setPaging(false);
            }
        },
        [teamId, modelId],
    );

    const usage = model?.usage;

    return (
        <Dialog open={model !== null} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{model?.name ?? 'Model'}</DialogTitle>
                    <DialogDescription>
                        What this model has answered, what it cost in tokens, and every call the
                        agents made through it. Tokens are the provider's own count, estimated
                        (marked ~) where it gave none.
                    </DialogDescription>
                </DialogHeader>

                {usage !== undefined && <UsageStats usage={usage} who="This model" />}

                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <Card gap={0} flush>
                    <CardHeader className="border-b py-5">
                        <CardTitle>Round-trips</CardTitle>
                    </CardHeader>

                    <CardContent padding="none">
                        {exchanges === null ? (
                            <Skeleton className="m-5 h-24" />
                        ) : (
                            <ExchangeList
                                key={page?.offset ?? 0}
                                exchanges={exchanges}
                                showAgent
                                empty="No agent has called this model yet."
                            />
                        )}
                    </CardContent>

                    {page !== null && exchanges !== null && exchanges.length > 0 && (
                        <CardFooter className="border-t py-4">
                            <Pager
                                page={page}
                                shown={exchanges.length}
                                busy={paging}
                                noun="round-trips"
                                onPage={(offset) => void goTo(offset)}
                            />
                        </CardFooter>
                    )}
                </Card>
            </DialogContent>
        </Dialog>
    );
}
