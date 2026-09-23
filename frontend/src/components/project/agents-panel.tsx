import { Bot, FileText, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    ApiError,
    agentCreate,
    agentList,
    modelList,
    type Paged,
    type TeamAgent,
    type TeamModel,
} from '@/apis';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { Pager } from '@/components/pager';
import { compactCount } from '@/libs/format';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { DataList } from '@/ui/data-value';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Select, SelectItem } from '@/ui/select';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function AgentsPanel({ teamId }: { teamId: number }) {
    const [agents, setAgents] = useState<TeamAgent[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [models, setModels] = useState<TeamModel[] | null>(null);

    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [modelId, setModelId] = useState('');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        Promise.all([agentList(teamId), modelList(teamId)])
            .then(([agentPayload, modelPayload]) => {
                if (!active) {
                    return;
                }

                setAgents(agentPayload.agents);
                setPage(agentPayload);
                setModels(modelPayload.models);

                if (modelPayload.models.length > 0) {
                    setModelId(String(modelPayload.models[0].id));
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setAgents([]);
                    setModels([]);
                    setError(
                        cause instanceof ApiError
                            ? cause.result
                            : 'The agents could not be loaded.',
                    );
                }
            });

        return () => {
            active = false;
        };
    }, [teamId]);

    const add = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();

            setFormError(null);
            setBusy(true);

            try {
                const agent = await agentCreate(
                    teamId,
                    name.trim(),
                    description.trim(),
                    Number(modelId),
                );

                setAgents((current) => [agent, ...(current ?? [])]);
                setPage((current) => current && { ...current, total: current.total + 1 });
                setName('');
                setDescription('');
                setCreating(false);
            } catch (cause) {
                setFormError(
                    cause instanceof ApiError ? cause.result : 'The agent could not be created.',
                );
            } finally {
                setBusy(false);
            }
        },
        [teamId, name, description, modelId],
    );

    const goTo = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await agentList(teamId, { offset });

                setAgents(next.agents);
                setPage(next);
            } catch (cause) {
                setError(
                    cause instanceof ApiError ? cause.result : 'The agents could not be loaded.',
                );
            } finally {
                setPaging(false);
            }
        },
        [teamId],
    );

    const hasModels = models !== null && models.length > 0;

    const createDialog = (
        <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
                <Button disabled={!hasModels} icon={<Plus />} message="New agent" />
            </DialogTrigger>

            <DialogContent>
                <Stack direction="Vertical" as="form" className="gap-5" onSubmit={add}>
                    <DialogHeader>
                        <DialogTitle>New agent</DialogTitle>
                        <DialogDescription>
                            An agent is a role with its own instructions, answering through one of
                            your models.
                        </DialogDescription>
                    </DialogHeader>

                    <Field label="Name">
                        {(id) => (
                            <Input
                                id={id}
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                minLength={2}
                                maxLength={64}
                                required
                                placeholder="Night shift support"
                            />
                        )}
                    </Field>

                    <Field label="What it does" hint="Optional. Shown on the agent card.">
                        {(id) => (
                            <Input
                                id={id}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                maxLength={280}
                                placeholder="Answers billing questions out of hours"
                            />
                        )}
                    </Field>

                    <Field label="Model">
                        {(id) => (
                            <Select
                                value={modelId}
                                onValueChange={setModelId}
                                id={id}
                                placeholder="Pick a model">
                                {models?.map((model) => (
                                    <SelectItem key={model.id} value={String(model.id)}>
                                        {`${model.name} · ${model.model}`}
                                    </SelectItem>
                                ))}
                            </Select>
                        )}
                    </Field>

                    {formError !== null && (
                        <Alert variant="destructive">
                            <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setCreating(false)}
                            message="Cancel"
                        />
                        <Button
                            type="submit"
                            disabled={busy}
                            message={busy ? 'Creating…' : 'Create agent'}
                        />
                    </DialogFooter>
                </Stack>
            </DialogContent>
        </Dialog>
    );

    return (
        <Stack direction="Vertical" as="section" className="gap-4">
            <Stack direction="Horizontal" className="flex-wrap items-center justify-between gap-3">
                <Text
                    type="BodyMuted"
                    message={
                        agents === null
                            ? 'Loading agents.'
                            : `${page?.total.toLocaleString() ?? agents.length} agent${(page?.total ?? agents.length) === 1 ? '' : 's'} in this project.`
                    }
                />

                {createDialog}
            </Stack>

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {models !== null && !hasModels && (
                <Alert>
                    <AlertDescription>
                        Add a model before creating an agent. An agent always answers through one.
                    </AlertDescription>
                </Alert>
            )}

            {agents === null && (
                <Stack direction="Vertical" className="gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:grid">
                    {[0, 1, 2].map((i) => (
                        <Skeleton radius="xl" className="h-36" key={i} />
                    ))}
                </Stack>
            )}

            {agents !== null && agents.length === 0 && hasModels && (
                <EmptyState
                    icon={Bot}
                    title="No agents yet"
                    description="An agent is the role that answers. Give it a name, point it at a model, then write its instructions."
                    action={createDialog}
                />
            )}

            {agents !== null && agents.length > 0 && (
                <Stack
                    direction="Vertical"
                    as="ul"
                    className="m-0 list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 sm:grid">
                    {agents.map((agent) => (
                        <Stack direction="Vertical" as="li" key={agent.id}>
                            <Card gap={3} className="h-full transition-colors hover:border-input">
                                <CardHeader>
                                    <CardTitle className="flex min-w-0 items-center gap-2">
                                        <Bot
                                            size={16}
                                            className="shrink-0 text-primary"
                                            aria-hidden="true"
                                        />
                                        <Text
                                            type="Foreground"
                                            as="span"
                                            className="truncate"
                                            message={agent.name}
                                        />
                                    </CardTitle>
                                </CardHeader>

                                <CardContent className="grid gap-3">
                                    <Text
                                        type="BodyMuted"
                                        className="line-clamp-2 min-h-[2lh]"
                                        message={
                                            agent.description === ''
                                                ? 'No description yet.'
                                                : agent.description
                                        }
                                    />

                                    <Stack
                                        direction="Horizontal"
                                        className="flex-wrap items-center gap-1.5">
                                        <Badge
                                            variant={
                                                agent.model_name === '' ? 'outline' : 'secondary'
                                            }
                                            className="font-mono">
                                            {agent.model_name === ''
                                                ? 'No model'
                                                : agent.model_name}
                                        </Badge>

                                        <Badge variant="outline" className="gap-1 font-mono">
                                            <FileText size={11} aria-hidden="true" />
                                            {agent.document_count}
                                        </Badge>
                                    </Stack>

                                    {agent.usage !== undefined && (
                                        <DataList dense>
                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Replies"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={`${agent.usage.replies.toLocaleString()} · ${agent.usage.failures.toLocaleString()} failed`}
                                            />

                                            <Text type="ForegroundMuted" as="dt" message="Tokens" />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={`${compactCount(agent.usage.prompt_tokens)} in · ${compactCount(agent.usage.completion_tokens)} out`}
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Last used"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={
                                                    agent.usage.last_used_at === null
                                                        ? 'Never'
                                                        : new Date(
                                                              agent.usage.last_used_at,
                                                          ).toLocaleString()
                                                }
                                            />
                                        </DataList>
                                    )}
                                </CardContent>

                                <CardFooter>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        link={`/dashboard/team/${teamId}/agent/${agent.id}`}
                                        message="Open agent"
                                    />
                                </CardFooter>
                            </Card>
                        </Stack>
                    ))}
                </Stack>
            )}

            {page !== null && agents !== null && agents.length > 0 && (
                <Pager
                    framed
                    page={page}
                    shown={agents.length}
                    busy={paging}
                    noun="agents"
                    onPage={(offset) => void goTo(offset)}
                />
            )}
        </Stack>
    );
}
