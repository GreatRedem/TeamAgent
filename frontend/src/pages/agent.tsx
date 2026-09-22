import { ArrowLeft, FilePlus, FileText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import {
    type AgentDocument,
    type AgentExchange,
    ApiError,
    agentDetails,
    agentDocumentCreate,
    agentExchanges,
    agentPermissionCatalog,
    agentPermissionUpdate,
    agentUpdate,
    modelList,
    type Paged,
    type Permission,
    type TeamAgent,
    type TeamModel,
} from '@/apis';
import { DocumentEditor } from '@/components/agent/document-editor';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { PermissionsPanel } from '@/components/project/permissions-panel';
import { cn } from '@/libs/cn';
import { AGENT_TABS, type AgentTab, PROBE_TONE } from '@/libs/constant';
import { teamPath } from '@/libs/navigation';
import { clearAccessToken, readAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { CodeBlock } from '@/ui/code-block';
import { Input } from '@/ui/input';
import { Pressable } from '@/ui/pressable';
import { Select, SelectItem } from '@/ui/select';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Tabs } from '@/ui/tabs';
import { Text } from '@/ui/text';

export function Agent() {
    const navigate = useNavigate();

    const { id, agentId } = useParams<{ id: string; agentId: string }>();

    const teamId = Number(id);
    const thisAgent = Number(agentId);

    const idsInvalid =
        !Number.isInteger(teamId) || teamId < 1 || !Number.isInteger(thisAgent) || thisAgent < 1;

    const [agent, setAgent] = useState<TeamAgent | null>(null);
    const [documents, setDocuments] = useState<AgentDocument[]>([]);
    const [models, setModels] = useState<TeamModel[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<AgentTab>(AGENT_TABS[0].value);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [modelId, setModelId] = useState('');
    const [savingAgent, setSavingAgent] = useState(false);
    const [saved, setSaved] = useState(false);

    const [newName, setNewName] = useState('');
    const [addingFile, setAddingFile] = useState(false);

    const [capabilities, setCapabilities] = useState<Permission[] | null>(null);
    const [savingCapability, setSavingCapability] = useState<string | null>(null);
    const [exchanges, setExchanges] = useState<AgentExchange[]>([]);
    const [exchangePage, setExchangePage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [openExchange, setOpenExchange] = useState<number | null>(null);

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
            agentDetails(teamId, thisAgent),
            modelList(teamId),
            agentPermissionCatalog(teamId),
            agentExchanges(teamId, thisAgent),
        ])
            .then(([details, modelPayload, catalog, exchangePayload]) => {
                if (!active) {
                    return;
                }

                setAgent(details.agent);
                setDocuments(details.documents);
                setModels(modelPayload.models);
                setCapabilities(catalog.permissions);
                setExchanges(exchangePayload.exchanges);
                setExchangePage(exchangePayload);
                setName(details.agent.name);
                setDescription(details.agent.description);
                setModelId(String(details.agent.model_id));
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
                    cause instanceof ApiError ? cause.result : 'This agent could not be loaded.',
                );
            });

        return () => {
            active = false;
        };
    }, [teamId, thisAgent, idsInvalid, navigate]);

    const saveAgent = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();

            setError(null);
            setSaved(false);
            setSavingAgent(true);

            try {
                setAgent(
                    await agentUpdate(
                        teamId,
                        thisAgent,
                        name.trim(),
                        description.trim(),
                        Number(modelId),
                    ),
                );
                setSaved(true);
            } catch (cause) {
                setError(
                    cause instanceof ApiError ? cause.result : 'The agent could not be saved.',
                );
            } finally {
                setSavingAgent(false);
            }
        },
        [teamId, thisAgent, name, description, modelId],
    );

    const goToExchanges = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await agentExchanges(teamId, thisAgent, { offset });

                setExchanges(next.exchanges);
                setExchangePage(next);
                setOpenExchange(null);
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
        [teamId, thisAgent],
    );

    const addDocument = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();

            setError(null);
            setAddingFile(true);

            try {
                const created = await agentDocumentCreate(
                    teamId,
                    thisAgent,
                    newName.trim(),
                    `# ${newName.trim().replace(/\.md$/, '')}\n\n`,
                );

                setDocuments((current) =>
                    [...current, created].toSorted((a, b) => a.name.localeCompare(b.name)),
                );
                setNewName('');
            } catch (cause) {
                setError(
                    cause instanceof ApiError ? cause.result : 'The file could not be created.',
                );
            } finally {
                setAddingFile(false);
            }
        },
        [teamId, thisAgent, newName],
    );

    const toggleCapability = useCallback(
        async (key: string) => {
            if (agent === null) {
                return;
            }

            const next = agent.permissions.includes(key)
                ? agent.permissions.filter((item) => item !== key)
                : [...agent.permissions, key];

            setError(null);
            setSavingCapability(key);

            try {
                setAgent(await agentPermissionUpdate(teamId, thisAgent, next));
            } catch (cause) {
                setError(
                    cause instanceof ApiError
                        ? cause.result
                        : 'The capability could not be changed.',
                );
            } finally {
                setSavingCapability(null);
            }
        },
        [teamId, thisAgent, agent],
    );

    if (idsInvalid) {
        return (
            <Alert variant="destructive">
                <AlertDescription>That agent address is not valid.</AlertDescription>
            </Alert>
        );
    }

    return (
        <>
            <PageHeader
                title={agent?.name ?? 'Agent'}
                description={
                    agent === null
                        ? 'Loading this agent.'
                        : agent.description === ''
                          ? 'No description yet.'
                          : agent.description
                }
                actions={
                    <Button
                        variant="outline"
                        link={teamPath(teamId, 'agents')}
                        icon={<ArrowLeft />}
                        message="All agents"
                    />
                }
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {agent === null && error === null && (
                <Stack direction="Vertical" className="gap-3">
                    <Skeleton radius="xl" className="h-40" />
                    <Skeleton radius="xl" className="h-64" />
                </Stack>
            )}

            {agent !== null && (
                <Tabs
                    label="Agent"
                    tabs={AGENT_TABS}
                    value={tab}
                    onValueChange={setTab}
                    panels={{
                        settings: (
                            <Stack direction="Vertical" className="gap-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Identity</CardTitle>
                                        <CardDescription>
                                            What this agent is called and which model answers for
                                            it.
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent>
                                        <Stack
                                            direction="Vertical"
                                            as="form"
                                            className="gap-5 lg:grid lg:grid-cols-3"
                                            onSubmit={saveAgent}>
                                            <Field label="Name">
                                                {(fieldId) => (
                                                    <Input
                                                        id={fieldId}
                                                        value={name}
                                                        onChange={(event) => {
                                                            setName(event.target.value);
                                                            setSaved(false);
                                                        }}
                                                        minLength={2}
                                                        maxLength={64}
                                                        required
                                                    />
                                                )}
                                            </Field>

                                            <Field label="What it does" hint="Optional.">
                                                {(fieldId) => (
                                                    <Input
                                                        id={fieldId}
                                                        value={description}
                                                        onChange={(event) => {
                                                            setDescription(event.target.value);
                                                            setSaved(false);
                                                        }}
                                                        maxLength={280}
                                                    />
                                                )}
                                            </Field>

                                            <Field label="Model">
                                                {(fieldId) => (
                                                    <Select
                                                        value={modelId}
                                                        onValueChange={(value) => {
                                                            setModelId(value);
                                                            setSaved(false);
                                                        }}
                                                        id={fieldId}
                                                        placeholder="Pick a model">
                                                        <SelectItem value="0">No model</SelectItem>
                                                        {models.map((model) => (
                                                            <SelectItem
                                                                key={model.id}
                                                                value={String(model.id)}>
                                                                {model.name}
                                                            </SelectItem>
                                                        ))}
                                                    </Select>
                                                )}
                                            </Field>

                                            <Stack
                                                direction="Horizontal"
                                                className="items-center gap-3 lg:col-span-3">
                                                <Button
                                                    type="submit"
                                                    disabled={savingAgent}
                                                    message={
                                                        savingAgent ? 'Saving…' : 'Save changes'
                                                    }
                                                />

                                                {saved && (
                                                    <Text
                                                        type="Body"
                                                        as="output"
                                                        className="text-primary"
                                                        message="Saved."
                                                    />
                                                )}
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>

                                <Card gap={0} flush>
                                    <CardHeader className="border-b py-5">
                                        <CardTitle>Recent round-trips</CardTitle>
                                        <CardDescription>
                                            What this agent last sent to its model, and what came
                                            back.
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent padding="none">
                                        {exchanges.length === 0 && (
                                            <Text
                                                type="BodyMuted"
                                                className="px-5 py-5"
                                                message="This agent has not answered anything yet."
                                            />
                                        )}

                                        <Stack
                                            direction="Vertical"
                                            as="ul"
                                            className="m-0 list-none p-0">
                                            {exchanges.map((exchange) => (
                                                <Stack
                                                    direction="Vertical"
                                                    as="li"
                                                    className="border-b last:border-b-0"
                                                    key={exchange.id}>
                                                    <Pressable
                                                        className="flex w-full items-center gap-3 border-0 bg-transparent px-5 py-3 text-start hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                                                        aria-expanded={openExchange === exchange.id}
                                                        onClick={() =>
                                                            setOpenExchange((current) =>
                                                                current === exchange.id
                                                                    ? null
                                                                    : exchange.id,
                                                            )
                                                        }>
                                                        <Text
                                                            type="DataMuted"
                                                            as="time"
                                                            className="shrink-0"
                                                            dateTime={exchange.created_at}
                                                            message={new Date(
                                                                exchange.created_at,
                                                            ).toLocaleTimeString(undefined, {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            })}
                                                        />

                                                        <Text
                                                            type="Body"
                                                            as="span"
                                                            className="min-w-0 grow truncate"
                                                            message={`Round ${exchange.round}, ${exchange.tool_calls} tool call${exchange.tool_calls === 1 ? '' : 's'}`}
                                                        />

                                                        <Text
                                                            type="DataMuted"
                                                            as="span"
                                                            className="shrink-0"
                                                            message={`${exchange.duration_ms.toLocaleString()} ms`}
                                                        />

                                                        <Text
                                                            type="BodyStrong"
                                                            as="span"
                                                            className={cn(
                                                                'shrink-0',
                                                                PROBE_TONE[
                                                                    exchange.outcome === 'ok'
                                                                        ? 'ok'
                                                                        : 'error'
                                                                ],
                                                            )}
                                                            message={`${exchange.outcome === 'ok' ? 'OK' : 'Failed'}${exchange.reason === '' ? '' : ` · ${exchange.reason}`}`}
                                                        />
                                                    </Pressable>

                                                    {openExchange === exchange.id && (
                                                        <Stack
                                                            direction="Vertical"
                                                            className="gap-3 bg-muted/30 px-5 py-4">
                                                            <Stack
                                                                direction="Vertical"
                                                                className="gap-1.5">
                                                                <Text
                                                                    type="BodyMuted"
                                                                    message="Sent"
                                                                />
                                                                <CodeBlock
                                                                    className="max-h-64"
                                                                    message={exchange.request}
                                                                />
                                                            </Stack>

                                                            <Stack
                                                                direction="Vertical"
                                                                className="gap-1.5">
                                                                <Text
                                                                    type="BodyMuted"
                                                                    message="Came back"
                                                                />
                                                                <CodeBlock
                                                                    className="max-h-64"
                                                                    message={exchange.response}
                                                                />
                                                            </Stack>
                                                        </Stack>
                                                    )}
                                                </Stack>
                                            ))}
                                        </Stack>
                                    </CardContent>

                                    {exchangePage !== null && exchanges.length > 0 && (
                                        <CardFooter className="border-t py-4">
                                            <Pager
                                                page={exchangePage}
                                                shown={exchanges.length}
                                                busy={paging}
                                                noun="round-trips"
                                                onPage={(offset) => void goToExchanges(offset)}
                                            />
                                        </CardFooter>
                                    )}
                                </Card>
                            </Stack>
                        ),

                        capabilities: (
                            <PermissionsPanel
                                title="Capabilities"
                                description="What this agent may do through the internal tools. Everything is off until you grant it."
                                catalog={capabilities}
                                granted={agent.permissions}
                                saving={savingCapability}
                                error={null}
                                onToggle={(key) => void toggleCapability(key)}
                            />
                        ),

                        files: (
                            <Stack direction="Vertical" as="section" className="gap-4">
                                <Stack
                                    direction="Horizontal"
                                    className="flex-wrap items-end justify-between gap-3">
                                    <Stack direction="Vertical" className="gap-1">
                                        <Text type="Heading" message="Instructions" />
                                        <Text
                                            type="BodyMuted"
                                            message="Markdown files that tell this agent how to behave."
                                        />
                                    </Stack>

                                    <Stack
                                        direction="Horizontal"
                                        as="form"
                                        className="items-end gap-2"
                                        onSubmit={addDocument}>
                                        <Field label="New file">
                                            {(fieldId) => (
                                                <Input
                                                    compact
                                                    id={fieldId}
                                                    className="font-mono"
                                                    value={newName}
                                                    onChange={(event) =>
                                                        setNewName(event.target.value)
                                                    }
                                                    pattern="[a-z0-9._-]+\.md"
                                                    title="Lowercase name ending in .md"
                                                    required
                                                    placeholder="examples.md"
                                                />
                                            )}
                                        </Field>

                                        <Button
                                            type="submit"
                                            variant="outline"
                                            disabled={addingFile}
                                            icon={<FilePlus />}
                                            message="Add"
                                        />
                                    </Stack>
                                </Stack>

                                {documents.length === 0 && (
                                    <EmptyState
                                        icon={FileText}
                                        title="No instructions yet"
                                        description="Create instructions.md to tell this agent who it is and how to answer."
                                    />
                                )}

                                {documents.map((document) => (
                                    <DocumentEditor
                                        key={document.id}
                                        teamId={teamId}
                                        agentId={thisAgent}
                                        document={document}
                                        onSaved={(saved_) =>
                                            setDocuments((current) =>
                                                current.map((item) =>
                                                    item.id === saved_.id ? saved_ : item,
                                                ),
                                            )
                                        }
                                        onRemoved={(removedId) =>
                                            setDocuments((current) =>
                                                current.filter((item) => item.id !== removedId),
                                            )
                                        }
                                    />
                                ))}
                            </Stack>
                        ),
                    }}
                />
            )}
        </>
    );
}
