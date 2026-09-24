import { useCallback, useEffect, useState } from 'react';

import { type AgentExchange, modelExchanges, type Paged, type TeamModel } from '@/apis';
import { ExchangeList } from '@/components/agent/exchange-list';
import { Pager } from '@/components/pager';
import { UsageStats } from '@/components/usage-stats';
import { apiError, t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Skeleton } from '@/ui/skeleton';

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
                    setError(apiError(cause, 'models.errors.roundTripsFailed'));
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
                setError(apiError(cause, 'models.errors.roundTripsFailed'));
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
                    <DialogTitle>{model?.name ?? t('models.usage.fallbackTitle')}</DialogTitle>
                    <DialogDescription>{t('models.usage.description')}</DialogDescription>
                </DialogHeader>

                {usage !== undefined && <UsageStats usage={usage} who={t('models.usage.who')} />}

                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <Card gap={0} flush>
                    <CardHeader className="border-b py-5">
                        <CardTitle>{t('models.usage.roundTrips')}</CardTitle>
                    </CardHeader>

                    <CardContent padding="none">
                        {exchanges === null ? (
                            <Skeleton className="m-5 h-24" />
                        ) : (
                            <ExchangeList
                                key={page?.offset ?? 0}
                                exchanges={exchanges}
                                showAgent
                                empty={t('models.usage.empty')}
                            />
                        )}
                    </CardContent>

                    {page !== null && exchanges !== null && exchanges.length > 0 && (
                        <CardFooter className="border-t py-4">
                            <Pager
                                page={page}
                                shown={exchanges.length}
                                busy={paging}
                                noun={t('models.usage.pagerNoun')}
                                onPage={(offset) => void goTo(offset)}
                            />
                        </CardFooter>
                    )}
                </Card>
            </DialogContent>
        </Dialog>
    );
}
