import { ArrowLeft, Bot } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import {
    ApiError,
    type Paged,
    type Permission,
    type ProfileFile,
    permissionCatalog,
    profileDetails,
    profileFiles,
    profilePermissionUpdate,
    type TelegramMessage,
    type TelegramProfile,
    type TelegramProfileBot,
} from '@/apis';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { PermissionsPanel } from '@/components/project/permissions-panel';
import { localPermissions } from '@/libs/catalog';
import { cn } from '@/libs/cn';
import { dateLabel, dateTimeLabel, numberLabel, tokenLabel } from '@/libs/format';
import { apiError, t, tn } from '@/libs/i18n';
import { teamPath } from '@/libs/navigation';
import { profileName } from '@/libs/profileName';
import { clearAccessToken, readAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { CodeBlock } from '@/ui/code-block';
import { DataList } from '@/ui/data-value';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

interface Details {
    profile: TelegramProfile;
    bots: TelegramProfileBot[];
    messages: TelegramMessage[];
}

function Detail({ label, value }: { label: string; value: string }) {
    if (value === '') {
        return null;
    }

    return (
        <>
            <Text type="ForegroundMuted" as="dt" message={label} />
            <Text type="Data" as="dd" className="break-anywhere" message={value} />
        </>
    );
}

export function ProfilePage() {
    const navigate = useNavigate();

    const { id, profileId } = useParams<{ id: string; profileId: string }>();

    const teamId = Number(id);
    const personId = Number(profileId);

    const idsInvalid =
        !Number.isInteger(teamId) || teamId < 1 || !Number.isInteger(personId) || personId < 1;

    const [details, setDetails] = useState<Details | null>(null);
    const [files, setFiles] = useState<ProfileFile[]>([]);
    const [filePage, setFilePage] = useState<Paged | null>(null);
    const [catalog, setCatalog] = useState<Permission[] | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [paging, setPaging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (readAccessToken() === null) {
            void navigate('/', { replace: true });

            return;
        }

        if (idsInvalid) {
            return;
        }

        let active = true;

        Promise.all([
            profileDetails(teamId, personId),
            profileFiles(teamId, personId),
            permissionCatalog(teamId),
        ])
            .then(([payload, filePayload, catalogPayload]) => {
                if (active) {
                    setDetails(payload);
                    setFiles(filePayload.files);
                    setFilePage(filePayload);
                    setCatalog(catalogPayload.permissions);
                }
            })
            .catch((cause: unknown) => {
                if (!active) {
                    return;
                }

                if (cause instanceof ApiError && cause.status === 401) {
                    clearAccessToken();

                    void navigate('/', { replace: true });

                    return;
                }

                setError(apiError(cause, 'people.errors.profileFailed'));
            });

        return () => {
            active = false;
        };
    }, [teamId, personId, idsInvalid, navigate]);

    const goToFiles = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await profileFiles(teamId, personId, { offset });

                setFiles(next.files);
                setFilePage(next);
            } catch (cause) {
                setError(apiError(cause, 'people.errors.notesFailed'));
            } finally {
                setPaging(false);
            }
        },
        [teamId, personId],
    );

    const toggle = useCallback(
        async (key: string) => {
            if (details === null) {
                return;
            }

            const granted = details.profile.permissions.includes(key);

            const next = granted
                ? details.profile.permissions.filter((item) => item !== key)
                : [...details.profile.permissions, key];

            setError(null);
            setSaving(key);

            try {
                const profile = await profilePermissionUpdate(teamId, personId, next);

                setDetails((current) => (current === null ? null : { ...current, profile }));
            } catch (cause) {
                setError(apiError(cause, 'people.errors.permissionFailed'));
            } finally {
                setSaving(null);
            }
        },
        [teamId, personId, details],
    );

    if (idsInvalid) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{t('errors.PROFILE_ID_INVALID')}</AlertDescription>
            </Alert>
        );
    }

    return (
        <>
            <PageHeader
                title={details === null ? t('people.profile.title') : profileName(details.profile)}
                description={
                    details === null
                        ? t('people.profile.loading')
                        : t('people.profile.summary', {
                              messages: tn(
                                  'people.profile.messages',
                                  details.profile.message_count,
                              ),
                              bots: tn('people.profile.bots', details.bots.length),
                          })
                }
                actions={
                    <Button
                        variant="outline"
                        link={teamPath(teamId, 'bots')}
                        icon={<ArrowLeft className="rtl:-scale-x-100" />}
                        message={t('people.profile.back')}
                    />
                }
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {details === null && error === null && (
                <Stack direction="Vertical" className="gap-3">
                    <Skeleton radius="xl" className="h-40" />
                    <Skeleton radius="xl" className="h-64" />
                </Stack>
            )}

            {details !== null && (
                <Stack
                    direction="Vertical"
                    className="xl:items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid">
                    <Stack direction="Vertical" className="gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('people.profile.messagesTitle')}</CardTitle>
                                <CardDescription>
                                    {t('people.profile.messagesDescription')}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="flex max-h-125 flex-col-reverse gap-3 overflow-y-auto">
                                {details.messages.length === 0 && (
                                    <Text
                                        type="BodyMuted"
                                        message={t('people.profile.noMessages')}
                                    />
                                )}

                                {details.messages.toReversed().map((message) => (
                                    <Stack
                                        direction="Vertical"
                                        key={message.id}
                                        className={cn(
                                            'max-w-[46ch] gap-1 rounded-lg border px-3 py-2',
                                            message.direction === 'out'
                                                ? 'self-end border-primary/30 bg-primary/10'
                                                : 'self-start bg-muted/40',
                                        )}>
                                        <Text
                                            type="Body"
                                            className="break-anywhere whitespace-pre-wrap"
                                            message={message.text}
                                        />
                                        <Text
                                            type="DataMuted"
                                            as="time"
                                            dateTime={message.sent_at}
                                            message={dateTimeLabel(message.sent_at)}
                                        />
                                    </Stack>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t('people.profile.notesTitle')}</CardTitle>
                                <CardDescription>
                                    {t('people.profile.notesDescription')}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="grid gap-3">
                                {files.length === 0 && (
                                    <Text type="BodyMuted" message={t('people.profile.noNotes')} />
                                )}

                                {files.map((file) => (
                                    <Stack
                                        direction="Vertical"
                                        className="gap-2 rounded-lg border p-4"
                                        key={file.id}>
                                        <Stack
                                            direction="Horizontal"
                                            className="flex-wrap items-center justify-between gap-2">
                                            <Stack
                                                direction="Horizontal"
                                                className="min-w-0 flex-wrap items-center gap-2">
                                                <Badge variant="secondary">
                                                    <Bot />
                                                    {file.agent_id === 0
                                                        ? t('people.profile.legacyNotes')
                                                        : file.agent_name === ''
                                                          ? t('people.profile.removedAgent')
                                                          : file.agent_name}
                                                </Badge>
                                                <Text type="DataStrong" message={file.name} />
                                            </Stack>
                                            <Text
                                                type="DataMuted"
                                                message={tokenLabel(file.content)}
                                            />
                                        </Stack>

                                        <CodeBlock className="max-h-60" message={file.content} />
                                    </Stack>
                                ))}
                            </CardContent>

                            {filePage !== null && files.length > 0 && (
                                <CardFooter className="border-t">
                                    <Pager
                                        page={filePage}
                                        shown={files.length}
                                        busy={paging}
                                        noun={t('people.pager.notes')}
                                        onPage={(offset) => void goToFiles(offset)}
                                    />
                                </CardFooter>
                            )}
                        </Card>
                    </Stack>

                    <Stack direction="Vertical" className="gap-6 xl:sticky xl:top-32">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('people.profile.identityTitle')}</CardTitle>
                                <CardDescription>
                                    {t('people.profile.identityDescription')}
                                </CardDescription>
                            </CardHeader>

                            <CardContent>
                                <DataList>
                                    <Detail
                                        label={t('people.profile.telegramId')}
                                        value={details.profile.telegram_id}
                                    />
                                    <Detail
                                        label={t('people.profile.username')}
                                        value={
                                            details.profile.username === ''
                                                ? ''
                                                : `@${details.profile.username}`
                                        }
                                    />
                                    <Detail
                                        label={t('people.profile.language')}
                                        value={details.profile.language_code}
                                    />
                                    <Detail
                                        label={t('people.profile.firstSeen')}
                                        value={dateLabel(details.profile.created_at)}
                                    />
                                    <Detail
                                        label={t('people.profile.lastSeen')}
                                        value={dateTimeLabel(details.profile.last_seen_at)}
                                    />
                                </DataList>

                                {details.bots.length > 0 && (
                                    <Stack
                                        direction="Vertical"
                                        as="ul"
                                        className="m-0 mt-5 list-none gap-2 border-t p-0 pt-4">
                                        {details.bots.map((bot) => (
                                            <Stack
                                                direction="Horizontal"
                                                as="li"
                                                className="items-baseline justify-between gap-3"
                                                key={bot.id}>
                                                <Text
                                                    type="Body"
                                                    as="span"
                                                    className="truncate"
                                                    message={bot.name}
                                                />
                                                <Text
                                                    type="DataMuted"
                                                    as="span"
                                                    className="shrink-0"
                                                    message={numberLabel(bot.message_count)}
                                                />
                                            </Stack>
                                        ))}
                                    </Stack>
                                )}
                            </CardContent>
                        </Card>

                        <PermissionsPanel
                            title={t('people.profile.permissionsTitle')}
                            description={t('people.profile.permissionsDescription')}
                            catalog={localPermissions(catalog)}
                            granted={details.profile.permissions}
                            saving={saving}
                            error={null}
                            onToggle={(key) => void toggle(key)}
                        />
                    </Stack>
                </Stack>
            )}
        </>
    );
}
