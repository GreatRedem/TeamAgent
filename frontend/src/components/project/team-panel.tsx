import { ArrowUpRight, Plus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    ApiError,
    agentList,
    agentPermissionUpdate,
    type RosterMember,
    rosterMemberRemove,
    rosterRead,
    type TeamAgent,
} from '@/apis';
import { ConfirmButton } from '@/components/confirm-button';
import { EmptyState } from '@/components/empty-state';
import { ROSTER_ACCESS, ROSTER_ERRORS } from '@/libs/constant';
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

// The team in team.json: who is on it, which agents answer from it, and the file itself.
export function TeamPanel({ teamId }: { teamId: number }) {
    const [members, setMembers] = useState<RosterMember[] | null>(null);
    const [agents, setAgents] = useState<TeamAgent[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    // null: closed. 'new': adding. A member: editing them.
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
                    setError(
                        cause instanceof ApiError
                            ? (ROSTER_ERRORS[cause.result] ?? cause.result)
                            : 'The team could not be loaded.',
                    );
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
                setError(
                    cause instanceof ApiError
                        ? (ROSTER_ERRORS[cause.result] ?? cause.result)
                        : 'The member could not be removed.',
                );
            }
        },
        [teamId],
    );

    // Grants or takes back one of the team.json capabilities from an agent.
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
                setError(
                    cause instanceof ApiError
                        ? cause.result
                        : 'The capability could not be changed.',
                );
            } finally {
                setSaving(null);
            }
        },
        [teamId],
    );

    const addButton = (
        <Button onClick={() => setEditing('new')} icon={<Plus />} message="Add member" />
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
                        members === null
                            ? 'Loading the team.'
                            : `${members.length.toLocaleString()} ${members.length === 1 ? 'person' : 'people'} in team.json.`
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
                    title="Nobody on the team yet"
                    description="Add the people agents should know about: their rank, what they do and where to find them. Pick them from the profiles that have written to your bots, or type them in."
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
                                        {member.rank !== undefined && (
                                            <Badge variant="secondary">{member.rank}</Badge>
                                        )}
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
                                                icon={<ArrowUpRight />}
                                                message="Profile"
                                            />
                                        )}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditing(member)}
                                            message="Modify"
                                        />

                                        <Stack direction="Horizontal" as="span" className="grow" />

                                        <ConfirmButton
                                            label="Remove"
                                            title={`Remove ${member.name}?`}
                                            description="They are taken out of team.json, and the agents stop knowing about them."
                                            confirmLabel="Remove member"
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
                    <CardTitle>Agents that answer from it</CardTitle>
                    <CardDescription>
                        An agent that may read team.json has it in its instructions and answers
                        questions about the team from it. Adding, updating and removing members are
                        separate tools, each granted on its own.
                    </CardDescription>
                </CardHeader>

                <CardContent className="grid gap-1">
                    {agents === null && <Skeleton className="h-16" />}

                    {agents !== null && agents.length === 0 && (
                        <Text type="BodyMuted" message="This project has no agents yet." />
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
                                        <Text type="Body" as="label" htmlFor={id} message={label} />
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
                        <CardDescription>The file as the agents are given it.</CardDescription>
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
