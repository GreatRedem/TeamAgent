import { useEffect, useState } from 'react';

import { ApiError, type ProjectOverview, projectOverview } from '@/apis';
import { Stat } from '@/components/stat';
import { compactCount } from '@/libs/format';
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
                    setError(
                        cause instanceof ApiError
                            ? cause.result
                            : 'The overview could not be loaded.',
                    );
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
                    <CardTitle>This week</CardTitle>
                    <CardDescription>
                        The last seven days, with the last 24 hours alongside.
                    </CardDescription>
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
                                label="Profiles"
                                value={compactCount(data.profiles.total)}
                                note={`${data.profiles.new_week.toLocaleString()} new, ${data.profiles.active_week.toLocaleString()} active this week`}
                            />
                            <Stat
                                label="New chats"
                                value={compactCount(data.chats.week)}
                                note={`${data.chats.today.toLocaleString()} in the last day`}
                            />
                            <Stat
                                label="Messages in"
                                value={compactCount(data.messages.week)}
                                note={`${data.messages.today.toLocaleString()} in the last day`}
                            />
                            <Stat
                                label="Model requests"
                                value={compactCount(data.requests.week)}
                                note={`${data.requests.today.toLocaleString()} in the last day, ${data.requests.failed_week.toLocaleString()} failed this week`}
                            />
                            <Stat
                                label="Replies"
                                value={compactCount(data.requests.replies_week)}
                                note="Answers the agents finished"
                            />
                            <Stat
                                label="Tokens"
                                value={compactCount(
                                    data.tokens.prompt_week + data.tokens.completion_week,
                                )}
                                note={`${compactCount(data.tokens.prompt_week)} in, ${compactCount(data.tokens.completion_week)} out`}
                            />
                        </Stack>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Model usage</CardTitle>
                    <CardDescription>
                        {data === null
                            ? 'Adding up what each model has used.'
                            : `${compactCount(allTokens)} tokens in all: ${compactCount(data.tokens.prompt_total)} in, ${compactCount(data.tokens.completion_total)} out.`}
                    </CardDescription>
                </CardHeader>

                <CardContent className="grid gap-4">
                    {data === null && <Skeleton radius="lg" className="h-24" />}

                    {data !== null && data.models.length === 0 && (
                        <Text type="BodyMuted" message="This project has no models yet." />
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
                                        message={`${model.replies.toLocaleString()} replies, ${model.failures.toLocaleString()} failed, ${compactCount(model.prompt_tokens)} in, ${compactCount(model.completion_tokens)} out`}
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
                            message="Every call, per model"
                        />
                    )}
                </CardContent>
            </Card>
        </>
    );
}
