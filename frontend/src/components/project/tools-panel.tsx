import { useCallback, useEffect, useState } from 'react';

import {
    agentList,
    agentPermissionCatalog,
    agentPermissionUpdate,
    type McpTool,
    mcpTools,
    type Permission,
    type TeamAgent,
} from '@/apis';
import { apiError, t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Switch } from '@/ui/switch';
import { Text } from '@/ui/text';

export function ToolsPanel({ teamId }: { teamId: number }) {
    const [tools, setTools] = useState<McpTool[] | null>(null);
    const [capabilities, setCapabilities] = useState<Permission[]>([]);
    const [agents, setAgents] = useState<TeamAgent[]>([]);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        Promise.all([
            mcpTools(teamId),
            agentPermissionCatalog(teamId),
            agentList(teamId, { limit: 200 }),
        ])
            .then(([toolPayload, catalog, agentPayload]) => {
                if (active) {
                    setTools(toolPayload.tools);
                    setCapabilities(catalog.permissions);
                    setAgents(agentPayload.agents);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setTools([]);
                    setError(apiError(cause, 'tools.errors.toolsLoadFailed'));
                }
            });

        return () => {
            active = false;
        };
    }, [teamId]);

    const toggle = useCallback(
        async (agent: TeamAgent, key: string) => {
            const next = agent.permissions.includes(key)
                ? agent.permissions.filter((item) => item !== key)
                : [...agent.permissions, key];

            setError(null);
            setSaving(`${agent.id}:${key}`);

            try {
                const updated = await agentPermissionUpdate(teamId, agent.id, next);

                setAgents((current) =>
                    current.map((item) =>
                        item.id === agent.id ? { ...item, permissions: updated.permissions } : item,
                    ),
                );
            } catch (cause) {
                setError(apiError(cause, 'tools.errors.capabilityFailed'));
            } finally {
                setSaving(null);
            }
        },
        [teamId],
    );

    const groups = capabilities
        .map((capability) => ({
            capability,
            tools: (tools ?? []).filter((tool) => tool.permission === capability.key),
        }))
        .filter((group) => group.tools.length > 0);

    return (
        <Stack direction="Vertical" as="section" className="gap-6">
            <Text
                type="BodyMuted"
                message={
                    tools === null
                        ? t('tools.mcp.loading')
                        : t('tools.mcp.summary', {
                              tools: tools.length,
                              capabilities: groups.length,
                          })
                }
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {tools === null && (
                <Stack direction="Vertical" className="gap-3">
                    {[0, 1, 2].map((i) => (
                        <Skeleton radius="xl" className="h-40" key={i} />
                    ))}
                </Stack>
            )}

            {groups.map(({ capability, tools: inGroup }) => (
                <Card key={capability.key}>
                    <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                            <Text type="Foreground" as="span" message={capability.label} />
                            <Badge variant="outline">{capability.key}</Badge>
                        </CardTitle>
                        <CardDescription>{capability.description}</CardDescription>
                    </CardHeader>

                    <CardContent className="grid gap-5">
                        <Stack direction="Vertical" as="ul" className="m-0 list-none gap-3 p-0">
                            {inGroup.map((tool) => (
                                <Stack
                                    direction="Vertical"
                                    as="li"
                                    className="gap-1 rounded-lg border px-4 py-3"
                                    key={tool.name}>
                                    <Text type="DataStrong" message={tool.name} />
                                    <Text type="BodyMuted" message={tool.description} />
                                </Stack>
                            ))}
                        </Stack>

                        <Stack direction="Vertical" className="gap-2">
                            <Text type="BodyStrong" message={t('tools.mcp.agentsTitle')} />

                            {agents.length === 0 && (
                                <Text type="BodyMuted" message={t('tools.noAgents')} />
                            )}

                            <Stack direction="Horizontal" className="flex-wrap gap-x-6 gap-y-3">
                                {agents.map((agent) => {
                                    const id = `tool-${capability.key}-${agent.id}`;

                                    return (
                                        <Stack
                                            direction="Horizontal"
                                            className="items-center gap-2"
                                            key={agent.id}>
                                            <Switch
                                                id={id}
                                                checked={agent.permissions.includes(capability.key)}
                                                disabled={
                                                    saving === `${agent.id}:${capability.key}`
                                                }
                                                onCheckedChange={() =>
                                                    void toggle(agent, capability.key)
                                                }
                                            />
                                            <Text
                                                type="Body"
                                                as="label"
                                                htmlFor={id}
                                                message={agent.name}
                                            />
                                        </Stack>
                                    );
                                })}
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
            ))}
        </Stack>
    );
}
