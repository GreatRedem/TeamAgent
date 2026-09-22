import { cn } from 'cn';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import {
    ApiError,
    permissionCatalog,
    profileDetails,
    profileFiles,
    profilePermissionUpdate,
    type Paged,
    type Permission,
    type ProfileFile,
    type TelegramMessage,
    type TelegramProfile,
    type TelegramProfileBot,
} from '@/api';
import { PermissionsPanel } from '@/components/project/permissions-panel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { Skeleton } from '@/components/ui/skeleton';
import { tokenLabel } from '@/lib/format';
import { teamPath } from '@/lib/navigation';
import { profileName } from '@/lib/profileName';
import { clearAccessToken, readAccessToken } from '@/lib/session';

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
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="m-0 font-mono text-2xs break-anywhere">{value}</dd>
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

                setError(
                    cause instanceof ApiError ? cause.result : 'This person could not be loaded.',
                );
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
                setError(
                    cause instanceof ApiError ? cause.result : 'The notes could not be loaded.',
                );
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
                setError(
                    cause instanceof ApiError
                        ? cause.result
                        : 'The permission could not be changed.',
                );
            } finally {
                setSaving(null);
            }
        },
        [teamId, personId, details],
    );

    if (idsInvalid) {
        return (
            <Alert variant="destructive">
                <AlertDescription>That person address is not valid.</AlertDescription>
            </Alert>
        );
    }

    return (
        <>
            <PageHeader
                title={details === null ? 'Person' : profileName(details.profile)}
                description={
                    details === null
                        ? 'Loading this person.'
                        : `${details.profile.message_count.toLocaleString()} message${details.profile.message_count === 1 ? '' : 's'} across ${details.bots.length} bot${details.bots.length === 1 ? '' : 's'}.`
                }
                actions={
                    <Button asChild variant="outline">
                        <Link to={teamPath(teamId, 'bots')}>
                            <ArrowLeft aria-hidden="true" />
                            All people
                        </Link>
                    </Button>
                }
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {details === null && error === null && (
                <div className="grid gap-3">
                    <Skeleton className="h-40 rounded-xl" />
                    <Skeleton className="h-64 rounded-xl" />
                </div>
            )}

            {details !== null && (
                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="grid gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Recent messages</CardTitle>
                                <CardDescription>
                                    The newest messages Nura has stored for this person.
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="grid gap-3">
                                {details.messages.length === 0 && (
                                    <p className="m-0 text-sm text-muted-foreground">
                                        No messages stored yet.
                                    </p>
                                )}

                                {details.messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            'grid max-w-[46ch] gap-1 rounded-lg border px-3 py-2',
                                            message.direction === 'out'
                                                ? 'justify-self-end border-primary/30 bg-primary/10'
                                                : 'justify-self-start bg-muted/40',
                                        )}
                                    >
                                        <p className="m-0 text-sm break-anywhere whitespace-pre-wrap">
                                            {message.text}
                                        </p>
                                        <time
                                            className="font-mono text-2xs text-muted-foreground"
                                            dateTime={message.sent_at}
                                        >
                                            {new Date(message.sent_at).toLocaleString()}
                                        </time>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Notes the agents keep</CardTitle>
                                <CardDescription>
                                    Files an agent has written about this person.
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="grid gap-3">
                                {files.length === 0 && (
                                    <p className="m-0 text-sm text-muted-foreground">
                                        No agent has written anything about this person yet.
                                    </p>
                                )}

                                {files.map((file) => (
                                    <div className="grid gap-2 rounded-lg border p-4" key={file.id}>
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <p className="m-0 font-mono text-sm font-semibold">
                                                {file.name}
                                            </p>
                                            <p className="m-0 font-mono text-2xs text-muted-foreground">
                                                {tokenLabel(file.content)}
                                            </p>
                                        </div>

                                        <pre className="m-0 max-h-60 overflow-auto rounded-md border bg-well p-3 font-mono text-2xs whitespace-pre-wrap">
                                            {file.content}
                                        </pre>
                                    </div>
                                ))}
                            </CardContent>

                            {filePage !== null && files.length > 0 && (
                                <CardFooter className="border-t">
                                    <PaginationFooter
                                        page={filePage}
                                        shown={files.length}
                                        busy={paging}
                                        noun="notes"
                                        onPage={(offset) => void goToFiles(offset)}
                                    />
                                </CardFooter>
                            )}
                        </Card>
                    </div>

                    <div className="grid gap-6 xl:sticky xl:top-32">
                        <Card>
                            <CardHeader>
                                <CardTitle>Identity</CardTitle>
                                <CardDescription>
                                    What Telegram reports about this person.
                                </CardDescription>
                            </CardHeader>

                            <CardContent>
                                <dl className="m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
                                    <Detail
                                        label="Telegram id"
                                        value={details.profile.telegram_id}
                                    />
                                    <Detail
                                        label="Username"
                                        value={
                                            details.profile.username === ''
                                                ? ''
                                                : `@${details.profile.username}`
                                        }
                                    />
                                    <Detail
                                        label="Language"
                                        value={details.profile.language_code}
                                    />
                                    <Detail
                                        label="First seen"
                                        value={new Date(
                                            details.profile.created_at,
                                        ).toLocaleDateString()}
                                    />
                                    <Detail
                                        label="Last seen"
                                        value={new Date(
                                            details.profile.last_seen_at,
                                        ).toLocaleString()}
                                    />
                                </dl>

                                {details.bots.length > 0 && (
                                    <ul className="m-0 mt-5 grid list-none gap-2 border-t p-0 pt-4">
                                        {details.bots.map((bot) => (
                                            <li
                                                className="flex items-baseline justify-between gap-3 text-sm"
                                                key={bot.id}
                                            >
                                                <span className="truncate">{bot.name}</span>
                                                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                                                    {bot.message_count.toLocaleString()}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>

                        <PermissionsPanel
                            title="Permissions"
                            description="What this person may ask an agent to do. Anything not granted is refused."
                            catalog={catalog}
                            granted={details.profile.permissions}
                            saving={saving}
                            error={null}
                            onToggle={(key) => void toggle(key)}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
