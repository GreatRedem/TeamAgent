import { ArrowUpRight, Plus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    agentList,
    agentPermissionUpdate,
    type RosterMember,
    rosterMemberRemove,
    rosterRead,
    type TeamAgent,
} from '@/apis';
import { ConfirmButton } from '@/components/confirm-button';
import { EmptyState } from '@/components/empty-state';
import { ROSTER_ACCESS } from '@/libs/constant';
import { apiError, t, tn } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { CodeBlock } from '@/ui/code-block';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Switch } from '@/ui/switch';
import { Text } from '@/ui/text';
import { MemberDialog } from './member-dialog';

export function TeamPanel({ teamId }: { teamId: number }) {
    const [members, setMembers] = useState<RosterMember[] | null>(null);
    const [agents, setAgents] = useState<TeamAgent[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [editing, setEditing] = useState<RosterMember | 'new' | null>(null);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        Promise.all([rosterRead(teamId), agentList(teamId, { limit: 200 })])
            .then(([roster, agentPayload]) => {
                if (active) {
                    setMembers(roster.members);
                    setAgents(agentPayload.agents);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setMembers([]);
                    setAgents([]);
                    setError(apiError(cause, 'team.errors.loadFailed'));
                }
            });

        return () => {
            active = false;
        };
    }, [teamId]);

    const remove = useCallback(
        async (name: string) => {
            setError(null);

            try {
                setMembers((await rosterMemberRemove(teamId, name)).members);
            } catch (cause) {
                setError(apiError(cause, 'team.errors.removeFailed'));
            }
        },
        [teamId],
    );

    const toggle = useCallback(
        async (agent: TeamAgent, key: string) => {
            const next = agent.permissions.includes(key)
                ? agent.permissions.filter((item) => item !== key)
                : [...agent.permissions, key];

            setError(null);
            setSaving(`${agent.id}:${key}`);

            try {
                const updated = await agentPermissionUpdate(teamId, agent.id, next);

                setAgents(
                    (current) =>
                        current?.map((item) =>
                            item.id === agent.id
                                ? { ...item, permissions: updated.permissions }
                                : item,
                        ) ?? null,
                );
            } catch (cause) {
                setError(apiError(cause, 'team.errors.permissionFailed'));
            } finally {
                setSaving(null);
            }
        },
        [teamId],
    );

    const addButton = (
        <Button onClick={() => setEditing('new')} icon={<Plus />} message={t('team.addMember')} />
    );

    return (
        <Stack direction="Vertical" as="section" className="gap-6">
            <MemberDialog
                open={editing !== null}
                teamId={teamId}
                member={editing === 'new' ? null : editing}
                onOpenChange={(next) => {
                    if (!next) {
                        setEditing(null);
                    }
                }}
                onSaved={setMembers}
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Stack direction="Horizontal" className="flex-wrap items-center justify-between gap-3">
                <Text
                    type="BodyMuted"
                    message={
                        members === null ? t('team.loading') : tn('team.summary', members.length)
                    }
                />

                {addButton}
            </Stack>

            {members === null && (
                <Stack direction="Vertical" className="gap-3 sm:grid sm:grid-cols-2">
                    {[0, 1].map((i) => (
                        <Skeleton radius="xl" className="h-40" key={i} />
                    ))}
                </Stack>
            )}

            {members !== null && members.length === 0 && (
                <EmptyState
                    icon={Users}
                    title={t('team.empty.title')}
                    description={t('team.empty.description')}
                    action={addButton}
                />
            )}

            {members !== null && members.length > 0 && (
                <Stack
                    direction="Vertical"
                    as="ul"
                    className="m-0 list-none gap-3 p-0 sm:grid sm:grid-cols-2">
                    {members.map((member) => (
                        <Stack direction="Vertical" as="li" key={member.name}>
                            <Card gap={3} className="h-full">
                                <CardHeader>
                                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Text
                                            type="Foreground"
                                            as="span"
                                            className="truncate"
                                            message={member.name}
                                        />
                                        {member.roles?.map((role) => (
                                            <Badge variant="secondary" key={role}>
                                                {role}
                                            </Badge>
                                        ))}
                                    </CardTitle>
                                    {member.description !== undefined && (
                                        <CardDescription className="whitespace-pre-wrap">
                                            {member.description}
                                        </CardDescription>
                                    )}
                                </CardHeader>

                                <CardContent className="mt-auto grid gap-3">
                                    {member.social !== undefined && (
                                        <Stack
                                            direction="Horizontal"
                                            className="flex-wrap items-center gap-1.5">
                                            {Object.entries(member.social).map(
                                                ([network, handle]) => (
                                                    <Badge variant="outline" key={network}>
                                                        {`${network}: ${handle}`}
                                                    </Badge>
                                                ),
                                            )}
                                        </Stack>
                                    )}

                                    <Stack
                                        direction="Horizontal"
                                        className="flex-wrap items-center gap-2">
                                        {member.profile_id !== undefined && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                link={`/dashboard/team/${teamId}/profile/${member.profile_id}`}
                                                icon={<ArrowUpRight className="rtl:-scale-x-100" />}
                                                message={t('team.member.profile')}
                                            />
                                        )}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditing(member)}
                                            message={t('team.member.modify')}
                                        />

                                        <Stack direction="Horizontal" as="span" className="grow" />

                                        <ConfirmButton
                                            label={t('team.remove.label')}
                                            title={t('team.remove.title', { name: member.name })}
                                            description={t('team.remove.description')}
                                            confirmLabel={t('team.remove.confirm')}
                                            onConfirm={() => void remove(member.name)}
                                        />
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Stack>
                    ))}
                </Stack>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>{t('team.agents.title')}</CardTitle>
                    <CardDescription>{t('team.agents.description')}</CardDescription>
                </CardHeader>

                <CardContent className="grid gap-1">
                    {agents === null && <Skeleton className="h-16" />}

                    {agents !== null && agents.length === 0 && (
                        <Text type="BodyMuted" message={t('team.agents.empty')} />
                    )}

                    {agents?.map((agent) => (
                        <Stack
                            direction="Horizontal"
                            className="flex-wrap items-center gap-x-6 gap-y-2 border-b py-3 last:border-b-0"
                            key={agent.id}>
                            <Text
                                type="Strong"
                                className="min-w-0 grow truncate"
                                message={agent.name}
                            />

                            {ROSTER_ACCESS.map(({ key, label }) => {
                                const id = `agent-${agent.id}-${key}`;

                                return (
                                    <Stack
                                        direction="Horizontal"
                                        className="items-center gap-2"
                                        key={key}>
                                        <Switch
                                            id={id}
                                            checked={agent.permissions.includes(key)}
                                            disabled={saving === `${agent.id}:${key}`}
                                            onCheckedChange={() => void toggle(agent, key)}
                                        />
                                        <Text
                                            type="Body"
                                            as="label"
                                            htmlFor={id}
                                            message={t(label)}
                                        />
                                    </Stack>
                                );
                            })}
                        </Stack>
                    ))}
                </CardContent>
            </Card>

            {members !== null && members.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>team.json</CardTitle>
                        <CardDescription>{t('team.file.description')}</CardDescription>
                    </CardHeader>

                    <CardContent>
                        <CodeBlock
                            className="max-h-96"
                            message={JSON.stringify({ members }, null, 2)}
                        />
                    </CardContent>
                </Card>
            )}
        </Stack>
    );
}
