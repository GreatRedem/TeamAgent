import { Cpu, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
    ApiError,
    type CatalogModel,
    modelCatalog,
    modelCreate,
    modelList,
    modelRemove,
    modelTest,
    modelUpdate,
    type Paged,
    type ProviderPreset,
    type TeamModel,
    type TeamModelProbe,
} from '@/apis';
import { ConfirmButton } from '@/components/confirm-button';
import { EmptyState } from '@/components/empty-state';
import { Pager } from '@/components/pager';
import { BLANK_MODEL, PROBE_TONE, PROVIDER_FALLBACK } from '@/libs/constant';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { DataList } from '@/ui/data-value';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

import { ModelDialog, type ModelDraft } from './model-dialog';

function probeState(probe: TeamModelProbe | 'testing'): string {
    if (probe === 'testing') {
        return 'pending';
    }

    return probe.ok ? 'ok' : 'error';
}

function probeLabel(probe: TeamModelProbe | 'testing'): string {
    if (probe === 'testing') {
        return 'Testing…';
    }

    if (!probe.ok) {
        return probe.reason ?? 'No answer';
    }

    return probe.found === true ? 'Reachable, model available' : 'Reachable, model not listed';
}

export function ModelsPanel({ teamId }: { teamId: number }) {
    const [models, setModels] = useState<TeamModel[] | null>(null);
    const [page, setPage] = useState<Paged | null>(null);
    const [paging, setPaging] = useState(false);
    const [providers, setProviders] = useState<ProviderPreset[]>(PROVIDER_FALLBACK);
    const [catalog, setCatalog] = useState<CatalogModel[]>([]);
    const [catalogUrl, setCatalogUrl] = useState('');

    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [draft, setDraft] = useState<ModelDraft>(BLANK_MODEL);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [probes, setProbes] = useState<Record<number, TeamModelProbe | 'testing'>>({});

    useEffect(() => {
        let active = true;

        modelList(teamId)
            .then((payload) => {
                if (active) {
                    setModels(payload.models);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) => {
                if (active) {
                    setModels([]);
                    setError(
                        cause instanceof ApiError
                            ? cause.result
                            : 'The models could not be loaded.',
                    );
                }
            });

        return () => {
            active = false;
        };
    }, [teamId]);

    useEffect(() => {
        let active = true;

        modelCatalog()
            .then((payload) => {
                if (active) {
                    setCatalog(payload.models ?? []);
                    setCatalogUrl(payload.base_url ?? '');

                    if (payload.providers?.length > 0) {
                        setProviders(payload.providers);
                    }
                }
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, []);

    const create = useCallback(
        async (url: string) => {
            setFormError(null);
            setBusy(true);

            try {
                const created = await modelCreate(
                    teamId,
                    draft.name.trim(),
                    draft.model.trim(),
                    url,
                    draft.apiKey.trim(),
                    Number(draft.contextTokens.trim() || 0),
                );

                setModels((current) => [created, ...(current ?? [])]);
                setPage((current) => current && { ...current, total: current.total + 1 });
                setDraft(BLANK_MODEL);
                setCreating(false);
            } catch (cause) {
                setFormError(
                    cause instanceof ApiError ? cause.result : 'The model could not be saved.',
                );
            } finally {
                setBusy(false);
            }
        },
        [teamId, draft],
    );

    const save = useCallback(
        async (url: string) => {
            if (editing === null) {
                return;
            }

            setFormError(null);
            setBusy(true);

            try {
                const updated = await modelUpdate(
                    teamId,
                    editing,
                    draft.name.trim(),
                    draft.model.trim(),
                    url,
                    draft.apiKey.trim(),
                    Number(draft.contextTokens.trim() || 0),
                );

                setModels(
                    (current) =>
                        current?.map((item) => (item.id === updated.id ? updated : item)) ?? null,
                );
                setProbes((current) => {
                    const { [editing]: _stale, ...rest } = current;
                    return rest;
                });
                setEditing(null);
                setDraft(BLANK_MODEL);
            } catch (cause) {
                setFormError(
                    cause instanceof ApiError ? cause.result : 'The model could not be saved.',
                );
            } finally {
                setBusy(false);
            }
        },
        [teamId, editing, draft],
    );

    const test = useCallback(
        async (modelId: number) => {
            setProbes((current) => ({ ...current, [modelId]: 'testing' }));

            try {
                const probe = await modelTest(teamId, modelId);

                setProbes((current) => ({ ...current, [modelId]: probe }));

                if ((probe.context ?? 0) > 0) {
                    setModels(
                        (current) =>
                            current?.map((item) =>
                                item.id === modelId
                                    ? { ...item, context_tokens: probe.context as number }
                                    : item,
                            ) ?? null,
                    );
                }
            } catch (cause) {
                setProbes((current) => ({
                    ...current,
                    [modelId]: {
                        ok: false,
                        reason: cause instanceof ApiError ? cause.result : 'No answer',
                    },
                }));
            }
        },
        [teamId],
    );

    const remove = useCallback(
        async (modelId: number) => {
            setError(null);

            try {
                await modelRemove(teamId, modelId);

                setModels((current) => current?.filter((item) => item.id !== modelId) ?? null);
                setPage(
                    (current) => current && { ...current, total: Math.max(0, current.total - 1) },
                );
                setProbes((current) => {
                    const { [modelId]: _done, ...rest } = current;
                    return rest;
                });
            } catch (cause) {
                setError(
                    cause instanceof ApiError ? cause.result : 'The model could not be removed.',
                );
            }
        },
        [teamId],
    );

    const goTo = useCallback(
        async (offset: number) => {
            setPaging(true);

            try {
                const next = await modelList(teamId, { offset });

                setModels(next.models);
                setPage(next);
            } catch (cause) {
                setError(
                    cause instanceof ApiError ? cause.result : 'The models could not be loaded.',
                );
            } finally {
                setPaging(false);
            }
        },
        [teamId],
    );

    const openCreate = () => {
        setDraft(BLANK_MODEL);
        setFormError(null);
        setCreating(true);
    };

    const openEdit = (item: TeamModel) => {
        setDraft({
            name: item.name,
            model: item.model,
            baseUrl: item.base_url,
            apiKey: '',
            contextTokens: item.context_tokens === 0 ? '' : String(item.context_tokens),
        });

        setFormError(null);
        setEditing(item.id);
    };

    const createButton = <Button onClick={openCreate} icon={<Plus />} message="Add model" />;

    return (
        <Stack direction="Vertical" as="section" className="gap-4">
            <Stack direction="Horizontal" className="flex-wrap items-center justify-between gap-3">
                <Text
                    type="BodyMuted"
                    message={
                        models === null
                            ? 'Loading models.'
                            : `${page?.total.toLocaleString() ?? models.length} endpoint${(page?.total ?? models.length) === 1 ? '' : 's'} this project can call.`
                    }
                />

                {createButton}
            </Stack>

            <ModelDialog
                open={creating}
                mode="create"
                teamId={teamId}
                draft={draft}
                providers={providers}
                catalog={catalog}
                catalogUrl={catalogUrl}
                busy={busy}
                error={formError}
                onChange={setDraft}
                onOpenChange={setCreating}
                onSubmit={(url) => void create(url)}
            />

            <ModelDialog
                open={editing !== null}
                mode="edit"
                teamId={teamId}
                draft={draft}
                providers={providers}
                catalog={catalog}
                catalogUrl={catalogUrl}
                busy={busy}
                error={formError}
                onChange={setDraft}
                onOpenChange={(next) => {
                    if (!next) {
                        setEditing(null);
                    }
                }}
                onSubmit={(url) => void save(url)}
            />

            {error !== null && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {models === null && (
                <Stack direction="Vertical" className="gap-3 sm:grid-cols-2 sm:grid">
                    {[0, 1].map((i) => (
                        <Skeleton radius="xl" className="h-52" key={i} />
                    ))}
                </Stack>
            )}

            {models !== null && models.length === 0 && (
                <EmptyState
                    icon={Cpu}
                    title="No models yet"
                    description="Point Nura at an OpenAI-compatible endpoint. Everything your agents say goes through one."
                    action={createButton}
                />
            )}

            {models !== null && models.length > 0 && (
                <Stack
                    direction="Vertical"
                    as="ul"
                    className="m-0 list-none gap-3 p-0 sm:grid-cols-2 sm:grid">
                    {models.map((item) => {
                        const probe = probes[item.id];

                        return (
                            <Stack direction="Vertical" as="li" key={item.id}>
                                <Card gap={3} className="h-full">
                                    <CardHeader>
                                        <CardTitle className="flex min-w-0 items-center gap-2">
                                            <Cpu
                                                size={16}
                                                className="shrink-0 text-primary"
                                                aria-hidden="true"
                                            />
                                            <Text
                                                type="Foreground"
                                                as="span"
                                                className="truncate"
                                                message={item.name}
                                            />
                                        </CardTitle>
                                    </CardHeader>

                                    <CardContent className="grid gap-3">
                                        <DataList dense>
                                            <Text type="ForegroundMuted" as="dt" message="Model" />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={item.model}
                                            />

                                            <Text
                                                type="ForegroundMuted"
                                                as="dt"
                                                message="Endpoint"
                                            />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={item.base_url}
                                            />

                                            <Text type="ForegroundMuted" as="dt" message="Key" />
                                            <Text
                                                type="Data"
                                                as="dd"
                                                className="truncate"
                                                message={item.key_hint}
                                            />
                                        </DataList>

                                        <Stack
                                            direction="Horizontal"
                                            className="flex-wrap items-center gap-1.5">
                                            <Badge
                                                variant={
                                                    item.context_tokens === 0
                                                        ? 'outline'
                                                        : 'secondary'
                                                }>
                                                {item.context_tokens === 0 ? (
                                                    'Window not read yet'
                                                ) : (
                                                    <>
                                                        <Text
                                                            type="Mono"
                                                            as="span"
                                                            message={item.context_tokens.toLocaleString()}
                                                        />{' '}
                                                        tokens
                                                    </>
                                                )}
                                            </Badge>
                                        </Stack>

                                        {probe !== undefined && (
                                            <Text
                                                type="Body"
                                                as="output"
                                                className={PROBE_TONE[probeState(probe)]}
                                                message={probeLabel(probe)}
                                            />
                                        )}
                                    </CardContent>

                                    <CardFooter className="gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={probe === 'testing'}
                                            onClick={() => void test(item.id)}
                                            message={probe === 'testing' ? 'Testing…' : 'Test'}
                                        />

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEdit(item)}
                                            message="Edit"
                                        />

                                        <Stack direction="Horizontal" as="span" className="grow" />

                                        <ConfirmButton
                                            label="Remove"
                                            title={`Remove ${item.name}?`}
                                            description="The stored key goes with it and cannot be recovered. Agents using this model stop answering."
                                            confirmLabel="Remove model"
                                            onConfirm={() => void remove(item.id)}
                                        />
                                    </CardFooter>
                                </Card>
                            </Stack>
                        );
                    })}
                </Stack>
            )}

            {page !== null && models !== null && models.length > 0 && (
                <Pager
                    page={page}
                    shown={models.length}
                    busy={paging}
                    noun="models"
                    onPage={(offset) => void goTo(offset)}
                />
            )}
        </Stack>
    );
}
