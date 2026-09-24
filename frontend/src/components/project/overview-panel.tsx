import { useEffect, useState } from 'react';

import { type ProjectOverview, projectOverview } from '@/apis';
import { Stat } from '@/components/stat';
import { compactCount } from '@/libs/format';
import { apiError, t } from '@/libs/i18n';
import { teamPath } from '@/libs/navigation';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Progress } from '@/ui/progress';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function OverviewPanel({ teamId }: { teamId: number }) {
    const [data, setData] = useState<ProjectOverview | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        projectOverview(teamId)
            .then((payload) => {
                if (active) {
                    setData(payload);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setError(apiError(cause, 'overview.errors.loadFailed'));
                }
            });

        return () => {
            active = false;
        };
    }, [teamId]);

    if (error !== null) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }

    const allTokens = (data?.tokens.prompt_total ?? 0) + (data?.tokens.completion_total ?? 0);

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>{t('overview.week.title')}</CardTitle>
                    <CardDescription>{t('overview.week.description')}</CardDescription>
                </CardHeader>

                <CardContent>
                    {data === null ? (
                        <Stack
                            direction="Vertical"
                            className="gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <Skeleton radius="lg" className="h-[7.5rem]" key={i} />
                            ))}
                        </Stack>
                    ) : (
                        <Stack
                            direction="Vertical"
                            className="gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
                            <Stat
                                label={t('overview.week.profiles')}
                                value={compactCount(data.profiles.total)}
                                note={t('overview.week.profilesNote', {
                                    new: data.profiles.new_week,
                                    active: data.profiles.active_week,
                                })}
                            />
                            <Stat
                                label={t('overview.week.chats')}
                                value={compactCount(data.chats.week)}
                                note={t('overview.week.lastDay', { count: data.chats.today })}
                            />
                            <Stat
                                label={t('overview.week.messages')}
                                value={compactCount(data.messages.week)}
                                note={t('overview.week.lastDay', { count: data.messages.today })}
                            />
                            <Stat
                                label={t('overview.week.requests')}
                                value={compactCount(data.requests.week)}
                                note={t('overview.week.requestsNote', {
                                    today: data.requests.today,
                                    failed: data.requests.failed_week,
                                })}
                            />
                            <Stat
                                label={t('overview.week.replies')}
                                value={compactCount(data.requests.replies_week)}
                                note={t('overview.week.repliesNote')}
                            />
                            <Stat
                                label={t('overview.week.tokens')}
                                value={compactCount(
                                    data.tokens.prompt_week + data.tokens.completion_week,
                                )}
                                note={t('overview.week.tokensNote', {
                                    input: compactCount(data.tokens.prompt_week),
                                    output: compactCount(data.tokens.completion_week),
                                })}
                            />
                        </Stack>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('overview.usage.title')}</CardTitle>
                    <CardDescription>
                        {data === null
                            ? t('overview.usage.loading')
                            : t('overview.usage.summary', {
                                  total: compactCount(allTokens),
                                  input: compactCount(data.tokens.prompt_total),
                                  output: compactCount(data.tokens.completion_total),
                              })}
                    </CardDescription>
                </CardHeader>

                <CardContent className="grid gap-4">
                    {data === null && <Skeleton radius="lg" className="h-24" />}

                    {data !== null && data.models.length === 0 && (
                        <Text type="BodyMuted" message={t('overview.usage.empty')} />
                    )}

                    {data?.models.map((model) => {
                        const used = model.prompt_tokens + model.completion_tokens;

                        return (
                            <Stack direction="Vertical" className="gap-1.5" key={model.id}>
                                <Stack
                                    direction="Horizontal"
                                    className="flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <Text type="Strong" className="truncate" message={model.name} />
                                    <Text
                                        type="DataMuted"
                                        message={t('overview.usage.model', {
                                            replies: model.replies,
                                            failures: model.failures,
                                            input: compactCount(model.prompt_tokens),
                                            output: compactCount(model.completion_tokens),
                                        })}
                                    />
                                </Stack>

                                <Progress
                                    value={allTokens === 0 ? 0 : (used / allTokens) * 100}
                                    size="thin"
                                    track="well"
                                />
                            </Stack>
                        );
                    })}

                    {data !== null && data.models.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="justify-self-start"
                            link={teamPath(teamId, 'models')}
                            message={t('overview.usage.calls')}
                        />
                    )}
                </CardContent>
            </Card>
        </>
    );
}
