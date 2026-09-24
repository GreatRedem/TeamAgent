import { Bot, FileText, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
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
import { roleText } from '@/libs/catalog';
import { AGENT_ROLES } from '@/libs/constant';
import { compactCount, dateTimeLabel, numberLabel } from '@/libs/format';
import { apiError, t, tn } from '@/libs/i18n';
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
    const [role, setRole] = useState('empty');
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
                    setError(apiError(cause, 'agents.errors.listFailed'));
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
                    AGENT_ROLES.find((item) => item.key === role)?.instructions ?? '',
                );

                setAgents((current) => [agent, ...(current ?? [])]);
                setPage((current) => current && { ...current, total: current.total + 1 });
                setRole('empty');
                setName('');
                setDescription('');
                setCreating(false);
            } catch (cause) {
                setFormError(apiError(cause, 'agents.errors.createFailed'));
            } finally {
                setBusy(false);
            }
        },
        [teamId, role, name, description, modelId],
    );

    const goTo = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await agentList(teamId, { offset });

                setAgents(next.agents);
                setPage(next);
            } catch (cause) {
                setError(apiError(cause, 'agents.errors.listFailed'));
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
                <Button
                    disabled={!hasModels}
                    icon={<Plus />}
                    message={t('agents.create.trigger')}
                />
            </DialogTrigger>

            <DialogContent>
                <Stack direction="Vertical" as="form" className="gap-5" onSubmit={add}>
                    <DialogHeader>
                        <DialogTitle>{t('agents.create.title')}</DialogTitle>
                        <DialogDescription>{t('agents.create.intro')}</DialogDescription>
                    </DialogHeader>

                    <Field label={t('agents.create.role')} hint={t('agents.create.roleHint')}>
                        {(id) => (
                            <Select
                                value={role}
                                onValueChange={(key) => {
                                    const picked = AGENT_ROLES.find((item) => item.key === key);

                                    setRole(key);
                                    setName(picked?.name ?? '');
                                    setDescription(picked?.description ?? '');
                                }}
                                id={id}>
                                <SelectItem value="empty">
                                    {t('agents.create.roleEmpty')}
                                </SelectItem>
                                {AGENT_ROLES.map((item) => (
                                    <SelectItem key={item.key} value={item.key}>
                                        {roleText(item.key, 'name', item.name)}
                                    </SelectItem>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label={t('agents.field.name')}>
                        {(id) => (
                            <Input
                                id={id}
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                minLength={2}
                                maxLength={64}
                                required
                                placeholder={t('agents.create.namePlaceholder')}
                            />
                        )}
                    </Field>

                    <Field
                        label={t('agents.field.whatItDoes')}
                        hint={t('agents.create.whatItDoesHint')}>
                        {(id) => (
                            <Input
                                id={id}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                maxLength={280}
                                placeholder={t('agents.create.whatItDoesPlaceholder')}
                            />
                        )}
                    </Field>

                    <Field label={t('agents.field.model')}>
                        {(id) => (
                            <Select
                                value={modelId}
                                onValueChange={setModelId}
                                id={id}
                                placeholder={t('agents.field.modelPlaceholder')}>
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
                            message={t('agents.create.cancel')}
                        />
                        <Button
                            type="submit"
                            disabled={busy}
                            message={
                                busy ? t('agents.create.submitting') : t('agents.create.submit')
                            }
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
                            ? t('agents.list.loading')
                            : tn('agents.list.count', page?.total ?? agents.length)
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
                    <AlertDescription>{t('agents.list.noModels')}</AlertDescription>
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
                    title={t('agents.list.empty.title')}
                    description={t('agents.list.empty.description')}
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
                                        <Bot size={16} className="shrink-0 text-primary" />
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
                                                ? t('agents.noDescription')
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
                                                ? t('agents.noModel')
                                                : agent.model_name}
                                        </Badge>

                                        <Badge variant="outline" className="gap-1 font-mono">
                                            <FileText size={11} />
                                            {numberLabel(agent.document_count)}
                                        </Badge>
                                    </Stack>

                                    {agent.usage !== undefined && (
                                        <DataList dense>
                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={t('agents.card.replies')}
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={t('agents.card.repliesValue', {
                                                    replies: agent.usage.replies,
                                                    failures: agent.usage.failures,
                                                })}
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={t('agents.card.tokens')}
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={t('agents.tokensInOut', {
                                                    prompt: compactCount(agent.usage.prompt_tokens),
                                                    completion: compactCount(
                                                        agent.usage.completion_tokens,
                                                    ),
                                                })}
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message={t('agents.card.lastUsed')}
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                message={
                                                    agent.usage.last_used_at === null
                                                        ? t('agents.card.never')
                                                        : dateTimeLabel(agent.usage.last_used_at)
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
                                        message={t('agents.card.open')}
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
                    noun={t('agents.list.pagerNoun')}
                    onPage={(offset) => void goTo(offset)}
                />
            )}
        </Stack>
    );
}
